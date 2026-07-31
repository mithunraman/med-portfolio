import type { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import type { MetricsService } from '../../common/metrics';
import type { RateLimitPolicy } from '../../config/app.config';
import type { Bucket, LlmEndpointResolver } from '../llm-endpoint.resolver';
import { Pool } from '../llm-pools';
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

function resolverStub(buckets: Bucket[]): LlmEndpointResolver {
  return { buckets: () => buckets } as unknown as LlmEndpointResolver;
}

const bucket = (pool: string, index: number): Bucket => ({
  bucketKey: `${pool}:${index}`,
  pool,
  index,
});

/** minTime is pinned to 0 by default so tests isolate reservoir behavior. */
const rate = (rpm: number, minTimeMs = 0): RateLimitPolicy => ({ rpm, minTimeMs });

describe('LlmRateLimiterService', () => {
  let service: LlmRateLimiterService;
  let releaseJobs: () => void;
  /** Jobs return this gate so they stay "running" until released. */
  let gate: Promise<void>;

  /** Single-bucket setup — the default for tests about one limiter's behavior. */
  function build(rpm: number, opts: { minTime?: number } = {}) {
    return buildPools([bucket('openai', 0)], { default: rate(rpm, opts.minTime ?? 0), byPool: {} });
  }

  function buildPools(
    buckets: Bucket[],
    rateLimit: { default: RateLimitPolicy; byPool: Record<string, RateLimitPolicy> }
  ) {
    const metrics = metricsStub();
    service = new LlmRateLimiterService(
      configStub({ 'app.llm.rateLimit': rateLimit }),
      metrics as unknown as MetricsService,
      resolverStub(buckets)
    );
    return metrics;
  }

  /** Reach a bucket's underlying Bottleneck for deterministic test control. */
  function limiterOf(bucketKey: string): { incrementReservoir: (n: number) => Promise<number> } {
    return (
      service as unknown as {
        limiters: Map<string, { incrementReservoir: (n: number) => Promise<number> }>;
      }
    ).limiters.get(bucketKey)!;
  }

  /** Schedule a gated job; swallow rejection so dropped jobs never leak. */
  function fire(bucketKey = 'openai:0') {
    void service.schedule(bucketKey, () => gate).catch(() => undefined);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    gate = new Promise<void>((resolve) => {
      releaseJobs = resolve;
    });
  });

  afterEach(async () => {
    // Release running jobs, then stop the limiters — dropping any still-queued
    // jobs (their rejections are swallowed in fire()). stop() does NOT clear
    // Bottleneck's heartbeat interval — only disconnect() does — so call that too,
    // to release the (unref'd) timer and let each test's limiter be GC'd. The Jest
    // worker exits cleanly regardless, because the heartbeat is unref'd.
    releaseJobs();
    const limiters = (
      service as unknown as {
        limiters: Map<
          string,
          {
            stop: (o: object) => Promise<void>;
            disconnect: (flush?: boolean) => Promise<void>;
          }
        >;
      }
    ).limiters;
    for (const bottleneck of limiters.values()) {
      try {
        await bottleneck.stop({ dropWaitingJobs: true });
      } catch {
        /* already idle */
      }
      await bottleneck.disconnect().catch(() => undefined);
    }
  });

  it('runs up to the cap immediately and queues the overflow', async () => {
    build(2);
    const started: number[] = [];
    for (let i = 0; i < 3; i++) {
      void service
        .schedule('openai:0', () => {
          started.push(i);
          return gate;
        })
        .catch(() => undefined);
    }

    await wait(30);

    expect(started).toEqual([0, 1]); // only 2 of 3 ran
    expect(service.counts('openai:0').QUEUED).toBe(1); // the 3rd is queued, not dropped
  });

  it('drains a queued call when the reservoir is replenished', async () => {
    build(1); // reservoir 1
    const order: number[] = [];

    const p1 = service.schedule('openai:0', async () => {
      order.push(1);
    });
    const p2 = service.schedule('openai:0', async () => {
      order.push(2);
    });

    await wait(30);
    expect(order).toEqual([1]); // reservoir=1: only the first runs, the second queues

    // Replenishing the reservoir triggers the SAME _drainAll path the timed
    // refresh uses in production — but deterministically, with no dependency on
    // the 60s window or Bottleneck's 250ms heartbeat.
    await limiterOf('openai:0').incrementReservoir(1);
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
    expect(metrics.recordLLMQueueDepth).toHaveBeenCalledWith(2, 'openai', 0);
  });

  it('has a queue-depth floor of 1 at enqueue even for an undelayed call', async () => {
    const metrics = build(100); // reservoir >> 1 → the call is never delayed
    fire();

    await wait(30);

    // Documents the floor: `queued` fires while the job is still QUEUED, so an
    // undelayed call still records exactly 1, never 0.
    expect(metrics.recordLLMQueueDepth).toHaveBeenCalledWith(1, 'openai', 0);
  });

  it('adds a breadcrumb (not an alert) when the reservoir depletes', async () => {
    build(2);
    for (let i = 0; i < 2; i++) fire(); // fill the reservoir → depleted fires

    await wait(30);

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'llm.ratelimit' })
    );
  });

  describe('per-pool policy', () => {
    it('applies each pool’s own cap, falling back to the default for unlisted pools', async () => {
      buildPools([bucket(Pool.Interactive, 0), bucket(Pool.Analysis, 0), bucket('openai', 0)], {
        default: rate(18),
        byPool: { [Pool.Interactive]: rate(60), [Pool.Analysis]: rate(35) },
      });

      const capOf = (key: string) =>
        (
          service as unknown as {
            limiters: Map<string, { currentReservoir: () => Promise<number | null> }>;
          }
        ).limiters
          .get(key)!
          .currentReservoir();

      expect(await capOf('interactive:0')).toBe(60);
      expect(await capOf('analysis:0')).toBe(35);
      expect(await capOf('openai:0')).toBe(18); // no byPool entry → default
    });

    it('REJECTS with a named error for an unknown bucket rather than a TypeError', async () => {
      build(2);

      // `rejects`, not a synchronous `toThrow`: schedule() is async precisely so
      // the error arrives through the one channel its `Promise<T>` signature
      // advertises. A sync throw here would bypass a caller's own `.catch()`.
      await expect(service.schedule('analysis:9', async () => undefined)).rejects.toThrow(
        /No LLM rate limiter for bucket 'analysis:9'/
      );
    });

    it('still throws SYNCHRONOUSLY from counts(), whose return type is sync', () => {
      build(2);
      // counts() returns a plain value, so a synchronous throw is the correct
      // channel for it — the async change applies to schedule() only.
      expect(() => service.counts('analysis:9')).toThrow(
        /No LLM rate limiter for bucket 'analysis:9'/
      );
    });
  });

  describe('bulkhead isolation', () => {
    it('does NOT let a saturated pool delay another pool', async () => {
      // The second reason pools exist (beyond differing caps): cleaning is
      // user-paced and blocks a message appearing, while analysis fires ~9-call
      // machine-paced bursts. A shared limiter would let a burst consume the
      // slots interactive work needs. This test is what a future "simplify back
      // to one limiter" refactor would have to break.
      buildPools([bucket(Pool.Interactive, 0), bucket(Pool.Analysis, 0)], {
        default: rate(18),
        byPool: { [Pool.Interactive]: rate(5), [Pool.Analysis]: rate(1) },
      });

      // Saturate analysis: 1 runs and holds the gate, 2 more queue.
      for (let i = 0; i < 3; i++) fire('analysis:0');
      await wait(30);
      expect(service.counts('analysis:0').QUEUED).toBeGreaterThanOrEqual(1);

      // Interactive must still run immediately, un-blocked by the analysis backlog.
      let ran = false;
      await service.schedule('interactive:0', async () => {
        ran = true;
      });

      expect(ran).toBe(true);
      expect(service.counts('interactive:0').QUEUED).toBe(0);
    });
  });
});
