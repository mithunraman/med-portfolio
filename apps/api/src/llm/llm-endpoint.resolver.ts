import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FoundryEndpoint, FoundryPools } from '../config/app.config';
import { bucketKeyOf, poolOf } from './llm-pools';
import type { ModelTarget } from './llm.service';
import { ModelConfigService } from './model-config.service';

/** One rate-limiter bucket: a single credential's independent quota. */
export interface Bucket {
  /** Bucket identity, `${pool}:${index}`. */
  bucketKey: string;
  pool: string;
  index: number;
}

/**
 * A resolved call target: which bucket paces it AND which credentials send it.
 * Returned as ONE value on purpose — see the class doc.
 */
export interface ResolvedBucket extends Bucket {
  /**
   * Foundry credentials for this bucket. Undefined for single-key providers
   * (openai / openrouter), whose credentials live on LLMService itself.
   */
  endpoint?: FoundryEndpoint;
}

/**
 * Deterministic, stateless router across the configured LLM endpoints.
 *
 * Owns the facts consulted by BOTH the rate limiter and the transport, so they
 * can never disagree:
 *  - the endpoint list per pool (per-key credentials),
 *  - the full bucket set (how many independent quotas exist, and their names),
 *  - the `(pool, routingKey) → endpoint index` mapping.
 *
 * A POOL is a named set of interchangeable credentials sharing one quota policy
 * (see llm-pools.ts). Bucket identity is therefore `(pool, indexWithinPool)`, not
 * a bare index: two pools each have an endpoint 0, and they are different quotas.
 *
 * Routing within a pool is `hash(routingKey) % N` — sticky (the same key resolves
 * to the same endpoint on every call AND across process restarts), spread across
 * that pool's keys, and needs no state. Only Azure Foundry exposes N > 1; every
 * other provider is single-key (N = 1), which collapses to "always endpoint 0".
 *
 * Consequence of stickiness: a single conversation is pinned to ONE key per pool,
 * so its own throughput is bound by that key's per-key rate regardless of N.
 * Adding keys raises the AGGREGATE capacity ceiling (across many conversations),
 * not any single journey's speed — if one journey is too slow, raise that pool's
 * cap; do not add keys. And because routing is a plain hash, N concurrent
 * conversations are not guaranteed to land on distinct keys — collisions are
 * expected and, at per-conversation rates well under the per-key cap, harmless;
 * genuine saturation surfaces in the per-endpoint queue-depth metric.
 *
 * `resolveBucket` returns credentials and bucket identity as a SINGLE value, and
 * that is what structurally guarantees the invariant: the key whose limiter gates
 * a call is always the key whose credentials send it. Handing back a bare index
 * for callers to look both up would leave the pairing to caller discipline —
 * survivable with one pool, a live hazard with several.
 */
@Injectable()
export class LlmEndpointResolver {
  private readonly logger = new Logger(LlmEndpointResolver.name);
  /** Pool → its endpoints. Only pools the active variant actually uses. */
  private readonly poolEndpoints = new Map<string, FoundryEndpoint[]>();

  constructor(configService: ConfigService, modelConfig: ModelConfigService) {
    const configured = configService.get<FoundryPools>('app.azureFoundry.pools');

    for (const pool of modelConfig.poolsInUse()) {
      // Single-key providers (openai/openrouter) have no configured endpoints;
      // they still get exactly one bucket, reproducing pre-pooling behavior.
      this.poolEndpoints.set(pool, configured?.[pool as keyof FoundryPools] ?? []);
    }

    const summary = [...this.poolEndpoints]
      .map(([pool, endpoints]) => `${pool}=${Math.max(endpoints.length, 1)}`)
      .join(', ');
    this.logger.log(`LLM endpoint router active: ${this.buckets().length} bucket(s) [${summary}]`);
  }

  /** Every bucket across every pool in use — the limiter builds one limiter per entry. */
  buckets(): Bucket[] {
    const buckets: Bucket[] = [];
    for (const [pool, endpoints] of this.poolEndpoints) {
      for (let index = 0; index < bucketCount(endpoints); index++) {
        buckets.push({ bucketKey: bucketKeyOf(pool, index), pool, index });
      }
    }
    return buckets;
  }

  /**
   * Resolve a target + routing key to the bucket that paces the call and the
   * credentials that send it. A missing/empty routing key pins to endpoint 0.
   */
  resolveBucket(target: ModelTarget, routingKey: string): ResolvedBucket {
    const pool = poolOf(target);
    const endpoints = this.poolEndpoints.get(pool) ?? [];
    const count = bucketCount(endpoints);
    const index = count === 1 || !routingKey ? 0 : hashString(routingKey) % count;

    return { bucketKey: bucketKeyOf(pool, index), pool, index, endpoint: endpoints[index] };
  }
}

/**
 * Buckets in a pool. Floors at 1 so a credential-less pool (openai/openrouter,
 * whose key lives on LLMService) is still rate-limited rather than unbucketed.
 * A Foundry pool with zero endpoints can't reach here — ModelConfigService fails
 * that at startup.
 */
function bucketCount(endpoints: FoundryEndpoint[]): number {
  return Math.max(endpoints.length, 1);
}

/**
 * djb2 string hash → unsigned 32-bit. Pure and deterministic (no Math.random /
 * Date), so the same key always lands on the same endpoint, including across
 * process restarts.
 */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33 + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}
