import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FoundryEndpoint } from '../config/app.config';
import { ModelConfigService } from './model-config.service';

/**
 * Deterministic, stateless router across the configured LLM endpoints.
 *
 * Owns the three facts consulted by BOTH the rate limiter and the transport, so
 * they can never disagree:
 *  - the endpoint list (per-key credentials),
 *  - the bucket count N (how many independent quotas exist),
 *  - the `routingKey → endpoint index` mapping.
 *
 * Routing is `hash(routingKey) % N` — sticky (the same key resolves to the same
 * endpoint on every call AND across process restarts), spread across keys, and
 * needs no state. Only Azure Foundry currently exposes N > 1 keys; every other
 * provider is single-key (N = 1), which collapses to "always endpoint 0" — the
 * exact pre-rotation behavior.
 *
 * Consequence of stickiness: a single conversation is pinned to ONE key, so its
 * own throughput is bound by that key's per-key rate regardless of N. Adding keys
 * raises the AGGREGATE capacity ceiling (across many conversations), not any single
 * journey's speed. And because routing is a plain hash, N concurrent conversations
 * are not guaranteed to land on distinct keys — collisions are expected and, at
 * per-conversation rates well under the per-key cap, harmless; genuine saturation
 * surfaces in the per-endpoint queue-depth metric (the trigger to revisit balancing).
 *
 * The index is computed once per call in LLMService and handed to both
 * `LlmRateLimiterService.schedule(index, …)` and credential selection, which is
 * what structurally guarantees the invariant: the key whose limiter gates a call
 * is always the key whose credentials send it.
 */
@Injectable()
export class LlmEndpointResolver {
  private readonly logger = new Logger(LlmEndpointResolver.name);
  private readonly endpointList: FoundryEndpoint[];
  private readonly bucketCount: number;

  constructor(configService: ConfigService, modelConfig: ModelConfigService) {
    this.endpointList = configService.get<FoundryEndpoint[]>('app.azureFoundry.endpoints') ?? [];
    // Foundry is the only provider that can expose multiple keys. If the active
    // variant doesn't route to Foundry (or none are configured), there's a single
    // quota bucket and routing always resolves to endpoint 0.
    this.bucketCount =
      modelConfig.usesProvider('azure-foundry') && this.endpointList.length > 0
        ? this.endpointList.length
        : 1;

    this.logger.log(`LLM endpoint router active: ${this.bucketCount} bucket(s)`);
  }

  /** The configured Foundry endpoints, indexed identically to the limiter buckets. */
  get endpoints(): FoundryEndpoint[] {
    return this.endpointList;
  }

  /** Number of independent rate-limit buckets (distinct keys) for the active provider. */
  count(): number {
    return this.bucketCount;
  }

  /**
   * Map a routing key (conversationId) to a stable endpoint index in [0, count).
   * A missing/empty key deterministically pins to endpoint 0.
   */
  indexFor(routingKey: string): number {
    if (this.bucketCount === 1 || !routingKey) return 0;
    return hashString(routingKey) % this.bucketCount;
  }
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
