/**
 * LLM quota pools, extracted to a leaf module so llm.service.ts (which puts
 * `pool` on ModelTarget), model-variants.ts (which assigns one per stage) and
 * app.config.ts (which parses each pool's credentials) can all reference them
 * without a runtime import cycle that would leave these consts undefined at load
 * time — the same hazard openai-models.ts exists to avoid. This module has NO
 * runtime imports; keep it that way.
 *
 * A pool is a named set of INTERCHANGEABLE credentials sharing ONE quota policy,
 * and it is the ONLY thing that owns "which key, which base URL, which cap".
 * `provider` is orthogonal: it says how to SHAPE a request, never which
 * credentials send it.
 *
 * Pools come in two kinds, and the kind explains the naming:
 *
 *  - WORKLOAD pools (Interactive, Analysis) are named for WHY they are
 *    separated, so moving a stage between them never makes a name a lie. They
 *    exist to isolate traffic shapes from each other, not just to hold keys.
 *  - PROVIDER pools (OpenAI, OpenRouter) are named for the provider because
 *    that IS the reason they are separate: a provider account is a distinct
 *    quota boundary. Naming them anything else would obscure it.
 *
 * Both kinds are deliberately independent of the model. On Azure Foundry an
 * (apiKey, baseURL) pair identifies a *resource*, and one resource hosts many
 * *deployments* — so "which quota" and "which model" are orthogonal. Deriving a
 * pool from the model name would break the moment two deployments share a
 * resource, or one model is served from two.
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
  /** The OpenAI account. One quota boundary, regardless of how many keys it holds. */
  OpenAI: 'openai',
  /** The OpenRouter account — likewise one quota boundary. */
  OpenRouter: 'openrouter',
} as const;
export type Pool = (typeof Pool)[keyof typeof Pool];

/** Every pool name — drives config parsing and startup validation. */
export const ALL_POOLS: readonly Pool[] = Object.values(Pool);

/** The per-pool facts that config parsing and validation need. */
export interface PoolSpec {
  /**
   * Env prefix for this pool's indexed endpoint pairs:
   * `<envPrefix>_API_KEY_<i>` / `<envPrefix>_BASE_URL_<i>`.
   */
  envPrefix: string;
  /**
   * Whether two endpoints sharing a base URL necessarily share a quota.
   *
   * TRUE on Azure Foundry: the base URL identifies the *resource*, and a
   * resource's "Key 1"/"Key 2" share its cap — configuring both would spin up
   * two limiters over ONE quota and produce sustained 429s. Worth rejecting at
   * startup, because our _1/_2 naming makes that an easy mistake.
   *
   * FALSE for account-scoped providers: two OpenAI keys from different orgs
   * legitimately share api.openai.com while holding independent quotas, so the
   * same check there would be a false positive that blocks a valid setup.
   *
   * IMPORTANT — `false` means UNCHECKABLE, not safe. Those pools carry exactly
   * the same hazard in a form we cannot detect: two DIFFERENT keys of ONE
   * account also share one quota (OpenAI meters per org/project, not per key),
   * and an API key does not encode its account, so there is no parse-time
   * signal to test. Resolving it would need a network call during config
   * parsing, which would put boot on the network path and fail closed on a
   * transient error — not worth it to guard a setup that has no upside anyway:
   * extra keys only add capacity when they add QUOTA, so multiple keys in an
   * account-scoped pool are only ever correct across SEPARATE accounts. That
   * constraint is therefore documented (.env.example, docs/llm/
   * llm-pipeline-stages.md) rather than enforced.
   *
   * So: do not "fix" the gap by re-enabling the base-URL check here. It would
   * reject the one legitimate multi-key setup while still missing the case
   * above. The narrow duplicate-key check in parseEndpoints is not a substitute
   * either — it only catches a repeated paste.
   */
  baseUrlImpliesSharedQuota: boolean;
}

/**
 * Per-pool configuration policy. Adding a pool is one entry here plus one in
 * `Pool` — the parser, the validator and the rate limiter all read from this
 * rather than branching on provider.
 */
export const POOL_SPECS: Record<Pool, PoolSpec> = {
  [Pool.Interactive]: { envPrefix: 'AZURE_FOUNDRY_INTERACTIVE', baseUrlImpliesSharedQuota: true },
  [Pool.Analysis]: { envPrefix: 'AZURE_FOUNDRY_ANALYSIS', baseUrlImpliesSharedQuota: true },
  [Pool.OpenAI]: { envPrefix: 'OPENAI', baseUrlImpliesSharedQuota: false },
  [Pool.OpenRouter]: { envPrefix: 'OPENROUTER', baseUrlImpliesSharedQuota: false },
};

/** Rate-limiter bucket identity for a (pool, endpoint index) pair. */
export function bucketKeyOf(pool: Pool, index: number): string {
  return `${pool}:${index}`;
}
