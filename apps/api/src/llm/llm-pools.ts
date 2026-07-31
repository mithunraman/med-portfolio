import type { ModelTarget } from './llm.service';

/**
 * LLM quota pools, extracted to a leaf module so BOTH llm.service.ts (which puts
 * `pool` on ModelTarget) and model-variants.ts (which assigns one per stage) can
 * reference them without a runtime import cycle that would leave these consts
 * undefined at load time — the same hazard openai-models.ts exists to avoid. The
 * `ModelTarget` import here is type-only, so it is erased and adds no edge.
 *
 * A pool is a named set of INTERCHANGEABLE credentials sharing ONE quota policy.
 * It is deliberately independent of the model: on Azure Foundry an (apiKey,
 * baseURL) pair identifies a *resource*, and one resource hosts many
 * *deployments* — so "which quota" and "which model" are orthogonal. Deriving
 * the pool from the model name would break the moment two deployments share a
 * resource, or one model is served from two.
 *
 * Pools are named for WHY they are separated, not for their current membership,
 * so moving a stage between them never makes a name a lie.
 */
export const Pool = {
  /**
   * User-paced and latency-critical: these calls sit between the user sending a
   * message and seeing it. Isolated from Analysis so a machine-paced analysis
   * burst can never starve interactive work of rate-limiter slots — a bulkhead
   * that holds even if the two pools' RPM caps ever converge.
   */
  Interactive: 'interactive',
  /** Machine-paced portfolio-analysis bursts (~9 calls per graph turn). */
  Analysis: 'analysis',
} as const;
export type Pool = (typeof Pool)[keyof typeof Pool];

/** Every pool name — drives config parsing and startup validation. */
export const ALL_POOLS: readonly Pool[] = Object.values(Pool);

/**
 * The quota pool a target draws from.
 *
 * Only Azure Foundry exposes multiple credentials, so it names its pool
 * explicitly. Every other provider is single-key and gets an implicit pool named
 * after the provider — which keeps pooling uniform across all providers instead
 * of a Foundry-only special case, so variants A/B/C/E need no branching anywhere
 * downstream.
 */
export function poolOf(target: ModelTarget): string {
  return target.provider === 'azure-foundry' ? target.pool : target.provider;
}

/** Rate-limiter bucket identity for a (pool, endpoint index) pair. */
export function bucketKeyOf(pool: string, index: number): string {
  return `${pool}:${index}`;
}
