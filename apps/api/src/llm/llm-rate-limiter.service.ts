import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import Bottleneck from 'bottleneck';
import { MetricsService } from '../common/metrics';

/**
 * How often the reservoir refills, in ms. `maxRequestsPerMinute` is the unit, so
 * this is one minute. Not configurable: there's no production need for another
 * window, and Bottleneck's local datastore only evaluates the refresh on a fixed
 * 250 ms heartbeat, so sub-250 ms values wouldn't be honored anyway. Tests drive
 * draining deterministically via `incrementReservoir` rather than shrinking this.
 */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Owns the single in-process rate limiter for outbound LLM calls.
 *
 * Bottleneck's `reservoir` gives exactly the semantics we want: at most
 * `maxRequestsPerMinute` calls run per rolling window; call N+1 does not error —
 * it queues and fires automatically as the reservoir refills. Callers wrap each
 * attempt with `schedule()` and are otherwise unaware throttling happened.
 *
 * Isolated from LLMService so the transport layer stays pure and this concern is
 * unit-testable on its own. Deliberately in-process and single-limiter today
 * (single API instance, one active provider); the seams here (one Bottleneck
 * instance, one `schedule` entry point) are where a per-provider map or Redis
 * clustering would later slot in without touching call sites.
 *
 * Transcription (AssemblyAI) is a separate quota and is intentionally NOT routed
 * through here.
 *
 * No shutdown hook: Bottleneck's reservoir-refresh timer is `.unref()`'d, so it
 * never blocks process exit and needs no explicit cleanup. Deliberately we do NOT
 * `stop()` the limiter on shutdown — that would reject the in-flight `schedule()`
 * calls of actively-running analyses, and the analysis handlers turn any such
 * rejection into a terminal FAILED run (which their terminal-status early-exit
 * then makes permanent). Leaving the limiter untouched lets SIGTERM's force-exit
 * abandon in-flight calls with the run still RUNNING, so the outbox stale-lock
 * reset recovers them from the LangGraph checkpoint on restart.
 */
@Injectable()
export class LlmRateLimiterService {
  private readonly logger = new Logger(LlmRateLimiterService.name);
  private readonly limiter: Bottleneck;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService
  ) {
    // Fallbacks mirror the schema defaults in app.config.ts (36 rpm / 1667ms) so a
    // missing key degrades to the SAFE config, not DeepSeek's 40-rpm cap with full
    // bursting. Keep in sync with LLM_MAX_REQUESTS_PER_MINUTE / LLM_MIN_TIME_MS.
    const rpm = this.configService.get<number>('app.llm.rateLimit.maxRequestsPerMinute') ?? 36;
    const minTime = this.configService.get<number>('app.llm.rateLimit.minTimeMs') ?? 1667;

    this.limiter = new Bottleneck({
      reservoir: rpm,
      reservoirRefreshAmount: rpm,
      reservoirRefreshInterval: REFRESH_INTERVAL_MS, // refill to `rpm` every minute
      ...(minTime > 0 ? { minTime } : {}),
    });

    this.logger.log(
      `LLM rate limiter active: ${rpm} req/min${minTime > 0 ? `, minTime ${minTime}ms` : ''}`
    );

    this.registerObservability();
  }

  /**
   * Run `fn` under the rate limit. Resolves/rejects with `fn`'s result; if the
   * reservoir is empty the call waits in the queue until a slot frees up.
   */
  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.limiter.schedule(fn);
  }

  /** Current job counts (RECEIVED/QUEUED/RUNNING/EXECUTING/DONE). */
  counts(): Bottleneck.Counts {
    return this.limiter.counts();
  }

  private registerObservability(): void {
    // High-frequency signal — the reservoir just hit 0 and calls are now queuing.
    // Breadcrumb only: this fires often under load and must never be an alert.
    this.limiter.on('depleted', () => {
      Sentry.addBreadcrumb({
        category: 'llm.ratelimit',
        level: 'warning',
        message: 'LLM rate limiter depleted — calls now queuing',
        data: this.limiter.counts(),
      });
    });

    // A call was enqueued — record the current backlog as a gauge. We do NOT
    // threshold-alert on queue depth: every LLM call originates from the outbox
    // consumer (bounded by MAX_CONCURRENCY), so QUEUED tops out at that
    // concurrency and can't reflect provider-quota pressure. The real "we hit the
    // cap" signal is `recordLLMRateLimited` on an actual 429 — see LLMService.
    //
    // NB: Bottleneck fires `queued` while the job is still in the QUEUED state
    // (before `_drainAll` promotes it to running), so counts().QUEUED includes
    // the enqueuing job itself. The gauge therefore has a floor of 1: a value of
    // 1 means "no real backlog"; genuine waiting shows as ≥2. We keep the raw
    // count (rather than subtracting 1) because several jobs can be enqueued at
    // once, so a blanket -1 would mislead in the opposite direction.
    this.limiter.on('queued', () => {
      this.metricsService.recordLLMQueueDepth(this.limiter.counts().QUEUED);
    });

    // Record the backlog draining back down as slots free up.
    this.limiter.on('done', () => {
      this.metricsService.recordLLMQueueDepth(this.limiter.counts().QUEUED);
    });
  }
}
