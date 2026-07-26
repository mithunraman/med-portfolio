import type { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import type { MetricsService } from '../../common/metrics';
import { LlmRateLimiterService } from '../llm-rate-limiter.service';

jest.mock('@sentry/nestjs', () => ({
  addBreadcrumb: jest.fn(),
}));

/**
 * Bottleneck is not compatible with Jest fake timers (its scheduler relies on
 * real macrotask ticks), so these tests use real timers with short waits. The
 * drain test replenishes the reservoir with `incrementReservoir` rather than
 * waiting out the (60s, 250ms-heartbeat-quantized) refresh window.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function configStub(values: Record<string, unknown>): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function metricsStub(): jest.Mocked<Pick<MetricsService, 'recordLLMQueueDepth'>> {
  return { recordLLMQueueDepth: jest.fn() };
}

describe('LlmRateLimiterService', () => {
  let service: LlmRateLimiterService;
  let releaseJobs: () => void;
  /** Jobs return this gate so they stay "running" until released. */
  let gate: Promise<void>;

  function build(rpm: number, opts: { minTime?: number } = {}) {
    const metrics = metricsStub();
    service = new LlmRateLimiterService(
      configStub({
        'app.llm.rateLimit.maxRequestsPerMinute': rpm,
        'app.llm.rateLimit.minTimeMs': opts.minTime ?? 0,
      }),
      metrics as unknown as MetricsService
    );
    return metrics;
  }

  /** Reach the underlying Bottleneck instance for deterministic test control. */
  function limiterOf(): { incrementReservoir: (n: number) => Promise<number> } {
    return (service as unknown as { limiter: { incrementReservoir: (n: number) => Promise<number> } })
      .limiter;
  }

  /** Schedule a gated job; swallow rejection so dropped jobs never leak. */
  function fire() {
    void service.schedule(() => gate).catch(() => undefined);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    gate = new Promise<void>((resolve) => {
      releaseJobs = resolve;
    });
  });

  afterEach(async () => {
    // Release running jobs, then stop the limiter — dropping any still-queued
    // jobs (their rejections are swallowed in fire()). stop() does NOT clear
    // Bottleneck's heartbeat interval — only disconnect() does — so call that too,
    // to release the (unref'd) timer and let each test's limiter be GC'd. The Jest
    // worker exits cleanly regardless, because the heartbeat is unref'd.
    releaseJobs();
    const bottleneck = (
      service as unknown as {
        limiter: {
          stop: (o: object) => Promise<void>;
          disconnect: (flush?: boolean) => Promise<void>;
        };
      }
    ).limiter;
    try {
      await bottleneck.stop({ dropWaitingJobs: true });
    } catch {
      /* already idle */
    }
    await bottleneck.disconnect().catch(() => undefined);
  });

  it('runs up to the cap immediately and queues the overflow', async () => {
    build(2);
    const started: number[] = [];
    for (let i = 0; i < 3; i++) {
      void service
        .schedule(() => {
          started.push(i);
          return gate;
        })
        .catch(() => undefined);
    }

    await wait(30);

    expect(started).toEqual([0, 1]); // only 2 of 3 ran
    expect(service.counts().QUEUED).toBe(1); // the 3rd is queued, not dropped
  });

  it('drains a queued call when the reservoir is replenished', async () => {
    build(1); // reservoir 1
    const order: number[] = [];

    const p1 = service.schedule(async () => {
      order.push(1);
    });
    const p2 = service.schedule(async () => {
      order.push(2);
    });

    await wait(30);
    expect(order).toEqual([1]); // reservoir=1: only the first runs, the second queues

    // Replenishing the reservoir triggers the SAME _drainAll path the timed
    // refresh uses in production — but deterministically, with no dependency on
    // the 60s window or Bottleneck's 250ms heartbeat.
    await limiterOf().incrementReservoir(1);
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]); // the queued call drained
  });

  it('records genuine backlog depth (beyond the enqueue self-count)', async () => {
    const metrics = build(1);
    for (let i = 0; i < 3; i++) fire(); // 1 runs, 2 queue → QUEUED reaches 2

    await wait(30);

    // 2 can only come from a genuinely-queued call. The enqueue self-count floor
    // (Bottleneck counts the enqueuing job) produces at most 1 on its own, so
    // this assertion can't pass without real queuing — unlike a `...With(1)` check.
    expect(metrics.recordLLMQueueDepth).toHaveBeenCalledWith(2);
  });

  it('has a queue-depth floor of 1 at enqueue even for an undelayed call', async () => {
    const metrics = build(100); // reservoir >> 1 → the call is never delayed
    fire();

    await wait(30);

    // Documents the floor: `queued` fires while the job is still QUEUED, so an
    // undelayed call still records exactly 1, never 0.
    expect(metrics.recordLLMQueueDepth).toHaveBeenCalledWith(1);
  });

  it('adds a breadcrumb (not an alert) when the reservoir depletes', async () => {
    build(2);
    for (let i = 0; i < 2; i++) fire(); // fill the reservoir → depleted fires

    await wait(30);

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'llm.ratelimit' })
    );
  });
});
