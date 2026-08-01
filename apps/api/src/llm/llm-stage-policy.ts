import type { Stage } from './model-variants';

/**
 * Per-stage invocation policy: the constants that depend on WHAT a stage asks the
 * model to do, not on WHICH model serves it.
 *
 * Deliberately separate from the VARIANTS table (model-variants.ts). That is keyed
 * by variant × stage because provider, model and pool all change together when
 * LLM_VARIANT flips. These three fields do not: `refine` wants temperature 0
 * because it is a constrained transform, and `check_completeness` needs cache
 * affinity because its prompt interpolates journey-scoped values ahead of its
 * static instructions — both true on every provider. Folding them into VARIANTS
 * would repeat identical values once per variant for something that never varies
 * by one.
 *
 * Leaf module, like llm-pools.ts: the `Stage` import is type-only, so it is erased
 * and adds no runtime edge that could leave these consts undefined at load time.
 */

/**
 * Whether a stage's CACHED PREFIX is specific to one journey.
 *
 * `Journey` — journey-scoped values lead the prompt. `check_completeness` emits
 * templateName, trainingStageContext and sectionBlock before ~1,300 tokens of
 * static instruction, and runs once per follow-up round. Those rounds must share
 * one API key, or each re-pays for a prefix the previous round already warmed.
 *
 * `None` — either the prefix is globally static, or the stage is called once per
 * journey so there is no within-journey reuse to protect.
 *
 * Note what "static" means here: it is POSITIONAL, not a property of the whole
 * prompt. Only the run of messages before the first varying byte is cacheable, so
 * a stage can interpolate freely as long as it does so AFTER its instructions.
 * `cleaning` renders `{transcript}`, but behind a ~1,000-token system message that
 * is a bare constant; `generate_followup` emits a variable-free ~1,900-token block
 * first (which is precisely why it was split that way). Every key warms such a
 * prefix independently, so pinning buys nothing — and it costs, because routing is
 * sticky: a pinned journey is bound to ONE key's rate limit however many keys the
 * pool has.
 */
export const CacheAffinity = {
  Journey: 'journey',
  None: 'none',
} as const;
export type CacheAffinity = (typeof CacheAffinity)[keyof typeof CacheAffinity];

export interface StagePolicy {
  /**
   * The stage's answer budget.
   *
   * NOT only a safety cap. Azure meters TPM against an ESTIMATE that includes
   * max_tokens, so an oversized value reserves quota the call never spends and
   * throttles the pool well below its RPM cap. Size from measured output plus
   * margin, not from "what could it conceivably need".
   *
   * This is what the STAGE needs. What the ENDPOINT can give is a separate ceiling
   * belonging with the target (Cerebras clamps at 8,192, deepinfra/turbo at
   * 16,384) — keeping them apart means re-pinning a provider never silently
   * changes a stage's intent.
   */
  maxTokens: number;
  /** 0 for constrained transforms, low for graders, higher where prose fluency matters. */
  temperature: number;
  cacheAffinity: CacheAffinity;
}

const { Journey, None } = CacheAffinity;

/**
 * Exhaustive by construction: a new Stage will not compile until it is classified
 * here, so no stage can silently inherit a default.
 *
 * Values are carried over unchanged from the call sites they replaced — this table
 * consolidates policy, it does not re-tune it. Re-tuning is now a one-file change
 * that can be measured on its own.
 */
export const STAGE_POLICY: Record<Stage, StagePolicy> = {
  cleaning: { maxTokens: 2000, temperature: 0.1, cacheAffinity: None },
  check_completeness: { maxTokens: 2000, temperature: 0.1, cacheAffinity: Journey },
  generate_followup: { maxTokens: 1000, temperature: 0.3, cacheAffinity: None },
  tag_capabilities: { maxTokens: 2000, temperature: 0.1, cacheAffinity: None },
  elicit_justification: { maxTokens: 1500, temperature: 0.3, cacheAffinity: None },
  // reflect/refine scale their budget with document length — this is the FLOOR.
  reflect: { maxTokens: 2000, temperature: 0.3, cacheAffinity: None },
  refine: { maxTokens: 1000, temperature: 0, cacheAffinity: None },
  generate_pdp: { maxTokens: 1000, temperature: 0.3, cacheAffinity: None },
};

/**
 * Build the sticky-routing key for a call. LlmEndpointResolver hashes this key to
 * pick one of the pool's endpoints, so the key decides whether calls stay together
 * or spread across keys.
 */
export function routingKeyFor(stage: Stage, conversationId: string): string {
  // Journey: the key must be STABLE, so every round of one journey — including a
  // round resumed after a process restart — reaches the key that warmed its prefix.
  if (STAGE_POLICY[stage].cacheAffinity === Journey) return conversationId;

  // None: the key only has to VARY. The prefix is globally static, so every key
  // warms it independently and there is nothing to hold together. Math.random is
  // deliberate here and is the simplest thing that spreads: a deterministic
  // discriminator would buy only recomputability, and the bucketKey recorded on
  // every call (see LLMService) gives that more directly.
  //
  // NB this does NOT rotate on retry. resolveBucket runs once per call, outside
  // invokeStructured's backOff loop, so every attempt reuses whichever endpoint
  // this resolved to. Fixing that means offsetting the resolved INDEX by the
  // attempt number inside the resolver — not mixing the attempt into this key,
  // which would only rotate by accident of djb2's structure and degrade silently
  // if the key format or attempt count ever changed.
  //
  // The conversationId and stage prefix carry no routing weight; they are here so
  // the key is self-describing wherever it surfaces in a log.
  return `${conversationId}:${stage}:${Math.random()}`;
}
