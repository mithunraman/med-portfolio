import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import Bottleneck from 'bottleneck';
import { MetricsService } from '../common/metrics';
import { LlmEndpointResolver } from './llm-endpoint.resolver';

/**
 * How often each reservoir refills, in ms. `maxRequestsPerMinute` is the unit, so
 * this is one minute. Not configurable: there's no production need for another
 * window, and Bottleneck's local datastore only evaluates the refresh on a fixed
 * 250 ms heartbeat, so sub-250 ms values wouldn't be honored anyway. Tests drive
 * draining deterministically via `incrementReservoir` rather than shrinking this.
 */
const REFRESH_INTERVAL_MS = 60_000;

/** Mirrors the LLM_MAX_REQUESTS_PER_MINUTE schema default (per key). */
const DEFAULT_RPM = 18;

/**
 * Owns the in-process rate limiters for outbound LLM calls — ONE limiter per key
 * (endpoint), so each key is paced independently under its own provider quota.
 *
 * Per-key limiting (a bulkhead per resource) is not a convenience: because each
 * key has its own RPM cap, a single global limiter at the aggregate rate could
 * NOT prevent an imbalanced minute from pushing more than one key's cap onto that
 * key (→ 429). The only correct structure for per-key quotas is a limiter per key.
 *
 * Bottleneck's `reservoir` gives the semantics we want: at most
 * `maxRequestsPerMinute` calls run per key per rolling window; call N+1 does not
 * error — it queues and fires as the reservoir refills. Callers pass the endpoint
 * index (from LlmEndpointResolver) plus the work to `schedule()`; the index picks
 * the bucket. When only one key is configured the array has length 1, reproducing
 * the pre-rotation single-limiter behavior exactly.
 *
 * `minTime` (derived from the cap in app.config as 60000 / rpm) spaces calls so a
 * key doesn't burst its whole reservoir at a window boundary.
 *
 * Transcription (AssemblyAI) is a separate quota and is intentionally NOT routed
 * through here.
 *
 * No shutdown hook: each reservoir-refresh timer is `.unref()`'d, so it never
 * blocks process exit and needs no cleanup. Deliberately we do NOT `stop()` the
 * limiters on shutdown — that would reject the in-flight `schedule()` calls of
 * actively-running analyses, and the analysis handlers turn any such rejection
 * into a terminal FAILED run (which their terminal-status early-exit then makes
 * permanent). Leaving the limiters untouched lets SIGTERM's force-exit abandon
 * in-flight calls with the run still RUNNING, so the outbox stale-lock reset
 * recovers them from the LangGraph checkpoint on restart.
 */
@Injectable()
export class LlmRateLimiterService {
  private readonly logger = new Logger(LlmRateLimiterService.name);
  /** One limiter per key/endpoint — indexed identically to LlmEndpointResolver. */
  private readonly limiters: Bottleneck[];

  constructor(
    configService: ConfigService,
    private readonly metricsService: MetricsService,
    resolver: LlmEndpointResolver
  ) {
    // Per-key cap. Fallback mirrors the schema default (18 rpm) so a missing key
    // degrades to the SAFE config, not full bursting. minTime is derived (in
    // app.config) from the same cap; the fallback here derives it too.
    const rpm = configService.get<number>('app.llm.rateLimit.maxRequestsPerMinute') ?? DEFAULT_RPM;
    const minTime =
      configService.get<number>('app.llm.rateLimit.minTimeMs') ??
      Math.floor(REFRESH_INTERVAL_MS / rpm);
    const count = resolver.count();

    this.limiters = Array.from({ length: count }, (_, index) =>
      this.buildLimiter(index, rpm, minTime)
    );

    this.logger.log(
      `LLM rate limiter active: ${count} key(s) × ${rpm} req/min` +
        `${minTime > 0 ? `, minTime ${minTime}ms` : ''}`
    );
  }

  /**
   * Run `fn` under the rate limit for the given endpoint. Resolves/rejects with
   * `fn`'s result; if that endpoint's reservoir is empty the call waits in its
   * queue until a slot frees up.
   */
  schedule<T>(index: number, fn: () => Promise<T>): Promise<T> {
    return this.limiters[index].schedule(fn);
  }

  /** Current job counts for one endpoint (RECEIVED/QUEUED/RUNNING/EXECUTING/DONE). */
  counts(index: number): Bottleneck.Counts {
    return this.limiters[index].counts();
  }

  private buildLimiter(index: number, rpm: number, minTime: number): Bottleneck {
    const limiter = new Bottleneck({
      reservoir: rpm,
      reservoirRefreshAmount: rpm,
      reservoirRefreshInterval: REFRESH_INTERVAL_MS, // refill to `rpm` every minute
      ...(minTime > 0 ? { minTime } : {}),
    });
    this.registerObservability(limiter, index);
    return limiter;
  }

  private registerObservability(limiter: Bottleneck, index: number): void {
    // High-frequency signal — this key's reservoir just hit 0 and calls are now
    // queuing. Breadcrumb only: fires often under load and must never be an alert.
    // Tagged with the endpoint so a single persistently-saturated key stands out.
    limiter.on('depleted', () => {
      Sentry.addBreadcrumb({
        category: 'llm.ratelimit',
        level: 'warning',
        message: `LLM rate limiter depleted (endpoint ${index}) — calls now queuing`,
        data: { endpoint: index, ...limiter.counts() },
      });
    });

    // A call was enqueued on this key — record its backlog as a per-endpoint gauge.
    // We do NOT threshold-alert on queue depth: every LLM call originates from the
    // outbox consumer (bounded by MAX_CONCURRENCY), so QUEUED tops out at that
    // concurrency and can't reflect provider-quota pressure. The real "we hit the
    // cap" signal is `recordLLMRateLimited` on an actual 429 — see LLMService.
    //
    // NB: Bottleneck fires `queued` while the job is still QUEUED (before
    // `_drainAll` promotes it to running), so counts().QUEUED includes the
    // enqueuing job itself. The gauge therefore has a floor of 1: a value of 1
    // means "no real backlog"; genuine waiting shows as ≥2.
    limiter.on('queued', () => {
      this.metricsService.recordLLMQueueDepth(limiter.counts().QUEUED, index);
    });

    // Record this key's backlog draining back down as slots free up.
    limiter.on('done', () => {
      this.metricsService.recordLLMQueueDepth(limiter.counts().QUEUED, index);
    });
  }
}
