import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import Bottleneck from 'bottleneck';
import { MetricsService } from '../common/metrics';
import type { RateLimitPolicy } from '../config/app.config';
import { LlmEndpointResolver } from './llm-endpoint.resolver';
import type { Pool } from './llm-pools';

/**
 * How often each reservoir refills, in ms. `maxRequestsPerMinute` is the unit, so
 * this is one minute. Not configurable: there's no production need for another
 * window, and Bottleneck's local datastore only evaluates the refresh on a fixed
 * 250 ms heartbeat, so sub-250 ms values wouldn't be honored anyway. Tests drive
 * draining deterministically via `incrementReservoir` rather than shrinking this.
 */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Owns the in-process rate limiters for outbound LLM calls — ONE limiter per
 * BUCKET, where a bucket is a (pool, key) pair, so each key is paced
 * independently under its own provider quota at its own pool's cap.
 *
 * Per-key limiting (a bulkhead per resource) is not a convenience: because each
 * key has its own RPM cap, a single global limiter at the aggregate rate could
 * NOT prevent an imbalanced minute from pushing more than one key's cap onto that
 * key (→ 429). The only correct structure for per-key quotas is a limiter per key.
 *
 * Pools add a second, independent reason to keep these separate: they isolate
 * workloads, not just quotas. The interactive pool (cleaning) is user-paced and
 * blocks a message appearing; the analysis pool fires ~9-call machine-paced
 * bursts. Separate limiters mean a burst can never consume the slots interactive
 * work needs — which stays true even if the two pools' caps later converge, so
 * do NOT merge them on the grounds that the numbers match.
 *
 * Bottleneck's `reservoir` gives the semantics we want: at most that pool's rpm
 * calls run per key per refresh window; call N+1 does not error — it queues and
 * fires as the reservoir refills. Callers pass the bucket key (from
 * LlmEndpointResolver.resolveBucket) plus the work to `schedule()`.
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
  /** One limiter per bucket, keyed identically to LlmEndpointResolver. */
  private readonly limiters = new Map<string, Bottleneck>();

  constructor(
    configService: ConfigService,
    private readonly metricsService: MetricsService,
    resolver: LlmEndpointResolver
  ) {
    // Per-pool caps. There is deliberately no fallback for a pool MISSING FROM
    // `byPool`: the pool set is a closed enum and app.config declares a cap for
    // every member (`satisfies Record<Pool, …>`), so a missing entry means code
    // and config have drifted. A fallback would paper over that by silently
    // pacing a pool at a guessed rate — surfacing as unexplained 429s or
    // unexplained slowness, both far harder to trace than a throw naming the pool.
    //
    // This says nothing about the ENV VARS. `LLM_RPM_<POOL>` each have a schema
    // default, so an operator omitting one boots at that value; the throw below
    // cannot catch that and is not meant to. See the envSchema comment.
    const configured = configService.get<{
      byPool?: Record<string, RateLimitPolicy>;
    }>('app.llm.rateLimit');

    for (const { bucketKey, pool, index } of resolver.buckets()) {
      const policy = configured?.byPool?.[pool];
      if (!policy) {
        throw new Error(
          `No LLM rate-limit policy configured for pool '${pool}' ` +
            `(expected app.llm.rateLimit.byPool.${pool}).`
        );
      }
      const { rpm, minTimeMs } = policy;
      this.limiters.set(bucketKey, this.buildLimiter(bucketKey, pool, index, rpm, minTimeMs));
      this.logger.log(
        `LLM rate limiter bucket ${bucketKey}: ${rpm} req/min` +
          `${minTimeMs > 0 ? `, minTime ${minTimeMs}ms` : ''}`
      );
    }
  }

  /**
   * Run `fn` under the rate limit for the given bucket. Resolves/rejects with
   * `fn`'s result; if that bucket's reservoir is empty the call waits in its
   * queue until a slot frees up.
   *
   * `async` is load-bearing, not decorative: without it `limiterFor`'s throw on an
   * unknown bucket escapes SYNCHRONOUSLY, so a caller writing
   * `schedule(k, fn).catch(h)` would have it blow straight past `h` — the `.catch`
   * isn't attached until the expression has already thrown. A signature returning
   * `Promise<T>` advertises exactly one error channel; this keeps that promise.
   */
  async schedule<T>(bucketKey: string, fn: () => Promise<T>): Promise<T> {
    return this.limiterFor(bucketKey).schedule(fn);
  }

  /** Current job counts for one bucket (RECEIVED/QUEUED/RUNNING/EXECUTING/DONE). */
  counts(bucketKey: string): Bottleneck.Counts {
    return this.limiterFor(bucketKey).counts();
  }

  /**
   * Buckets are built from the same resolver that hands them out, so an unknown
   * key means those two drifted. Fail loudly and name it — the alternative is a
   * bare `Cannot read properties of undefined` from deep inside a retry.
   */
  private limiterFor(bucketKey: string): Bottleneck {
    const limiter = this.limiters.get(bucketKey);
    if (!limiter) {
      throw new Error(
        `No LLM rate limiter for bucket '${bucketKey}'. Known buckets: ` +
          `${[...this.limiters.keys()].join(', ') || '(none)'}.`
      );
    }
    return limiter;
  }

  private buildLimiter(
    bucketKey: string,
    pool: Pool,
    index: number,
    rpm: number,
    minTime: number
  ): Bottleneck {
    const limiter = new Bottleneck({
      reservoir: rpm,
      reservoirRefreshAmount: rpm,
      reservoirRefreshInterval: REFRESH_INTERVAL_MS, // refill to `rpm` every minute
      ...(minTime > 0 ? { minTime } : {}),
    });
    this.registerObservability(limiter, bucketKey, pool, index);
    return limiter;
  }

  private registerObservability(
    limiter: Bottleneck,
    bucketKey: string,
    pool: Pool,
    index: number
  ): void {
    // High-frequency signal — this key's reservoir just hit 0 and calls are now
    // queuing. Breadcrumb only: fires often under load and must never be an alert.
    // Tagged with the bucket so a single persistently-saturated key stands out.
    limiter.on('depleted', () => {
      Sentry.addBreadcrumb({
        category: 'llm.ratelimit',
        level: 'warning',
        message: `LLM rate limiter depleted (bucket ${bucketKey}) — calls now queuing`,
        data: { pool, endpoint: index, ...limiter.counts() },
      });
    });

    // A call was enqueued on this key — record its backlog as a per-bucket gauge.
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
      this.metricsService.recordLLMQueueDepth(limiter.counts().QUEUED, pool, index);
    });

    // Record this key's backlog draining back down as slots free up.
    limiter.on('done', () => {
      this.metricsService.recordLLMQueueDepth(limiter.counts().QUEUED, pool, index);
    });
  }
}
