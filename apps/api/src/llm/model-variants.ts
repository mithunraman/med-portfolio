import { Pool } from './llm-pools';
import type { ModelTarget, StructuredMethod, ThinkMode } from './llm.service';
import { OpenAIModels } from './openai-models';

/**
 * The pipeline stages that make an LLM call. A stage names *itself* when it
 * resolves a model, so the concrete provider/model lives in exactly one place
 * (the VARIANTS table) rather than being hardcoded at each call site.
 */
export const Stage = {
  Cleaning: 'cleaning',
  Classify: 'classify',
  CheckCompleteness: 'check_completeness',
  GenerateFollowup: 'generate_followup',
  TagCapabilities: 'tag_capabilities',
  ElicitJustification: 'elicit_justification',
  Reflect: 'reflect',
  Refine: 'refine',
  GeneratePdp: 'generate_pdp',
} as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

/** Known variants. */
export type VariantKey = 'A' | 'B' | 'C' | 'D' | 'E';

/** A variant is a complete stage→target mapping — every stage must be present. */
export type VariantProfile = Record<Stage, ModelTarget>;

/**
 * Pools are defaulted in these helpers rather than spelled out per stage: for a
 * single-account provider there is exactly one sensible pool, and repeating it
 * nine times per variant would be noise. The parameter still exists so a variant
 * CAN split (as D does on Foundry) the moment a second account appears.
 */
const openai = (model: string, pool: Pool = Pool.OpenAI): ModelTarget => ({
  provider: 'openai',
  pool,
  model,
});

// Variant B: DeepSeek V4 Flash served through OpenRouter, pinned to Alibaba Cloud
// Int. as the upstream inference provider (OpenRouter slug `alibaba`) for every
// stage — its Flash endpoint supports tools, reasoning, and structured_outputs.
const DEEPSEEK_FLASH = 'deepseek/deepseek-v4-flash';
const DEEPSEEK_PRO = 'deepseek/deepseek-v4-pro';
// Variant E: OpenAI's gpt-oss-120b (Apache 2.0, 131k context) — chosen for EU
// portability rather than raw capability. It is the only open model carried by
// ALL FOUR EU-resident providers (Scaleway, OVHcloud, IONOS, STACKIT), so a
// result here transfers directly to an EU-resident host. Cheaper than DeepSeek
// V4 Flash ($0.037/$0.17 per 1M on DeepInfra vs $0.14/$0.28), but lower on the
// Artificial Analysis Intelligence Index: 15 at low reasoning effort and 24 at
// high, against V4 Flash's 29 non-reasoning. Variant E is the "can we ship the
// cheap EU-portable option at all?" probe, not a like-for-like swap.
const GPT_OSS_120B = 'openai/gpt-oss-120b';
// OpenRouter upstream inference provider slugs (from openrouter.ai/api/v1/providers).

// const ALIBABA_ROUTE = ['alibaba'];
const ATLAS_CLOUD_ROUTE = ['atlas-cloud'];
// DeepInfra serves gpt-oss-120b at bf16 (unquantized) and honours
// `response_format: json_schema` with `strict: true`. bf16 is deliberate: the
// cheaper fp4 endpoints (CoreWeave, Novita) would make quantization a second
// variable in a quality comparison that is supposed to isolate the model.
const DEEPINFRA_ROUTE = ['deepinfra'];

/**
 * DeepSeek-on-OpenRouter target with a per-stage reasoning ("think") mode.
 *
 * Uses `jsonSchema` structured output (response_format), not tool-calling:
 * DeepSeek emits tool calls in its native DSML token format plus a conversational
 * preamble, which the endpoint doesn't normalize into OpenAI `tool_calls`, so the
 * function-calling parser chokes ("...is not valid JSON"). jsonSchema constrains
 * the response to be the schema JSON itself — no tool wrapper, no preamble.
 * Requires the pinned provider to advertise `structured_outputs` (Alibaba does).
 */
const deepseek = (
  model: string,
  thinkMode: ThinkMode,
  route: string[] = ATLAS_CLOUD_ROUTE,
  pool: Pool = Pool.OpenRouter
): ModelTarget => ({
  provider: 'openrouter',
  pool,
  model,
  thinkMode,
  route,
  structuredMethod: 'jsonSchema',
});

/**
 * gpt-oss-on-OpenRouter target, pinned to DeepInfra.
 *
 * Reasoning is NOT optional on this model: every provider rejects
 * `reasoning: {enabled: false}` with "Reasoning is mandatory for this endpoint
 * and cannot be disabled", so `thinkMode: 'off'` cannot be used here — the
 * lowest setting is `'low'`. Effort is the dominant cost/latency knob: measured
 * on the generate_followup prompt, `low` returns in ~200-300 completion tokens
 * while `high` burns ~1,770 and takes ~39s, which would both blow that stage's
 * maxTokens: 1000 and wreck the interactive flow. Hence 'low' below.
 *
 * Kept on jsonSchema (not tool-calling) so a B-vs-E comparison differs only by
 * model, not by how the schema is enforced. Unlike Qwen, this model accepts the
 * two-system-message prompt shape used by generate_followup unchanged.
 */
const gptOss = (
  model: string,
  thinkMode: ThinkMode,
  route: string[] = DEEPINFRA_ROUTE,
  pool: Pool = Pool.OpenRouter
): ModelTarget => ({
  provider: 'openrouter',
  pool,
  model,
  thinkMode,
  route,
  structuredMethod: 'jsonSchema',
});

// Variant D: DeepSeek V4 Flash served through Azure AI Foundry's OpenAI-compatible
// endpoint (a first-party-cloud alternative to the OpenRouter route in B), for D's
// eight graph stages. The value is the Foundry *deployment name*, not a catalog
// slug — set it to whatever the deployment is called in your Foundry resource.
const DEEPSEEK_FLASH_FOUNDRY = 'DeepSeek-V4-Flash';
// Variant D: GPT-5.4-nano deployed on Azure Foundry, serving the cleaning stage
// only. Also a Foundry *deployment name*. Unlike DeepSeek it normalizes into
// OpenAI `tool_calls`, so it uses native function calling (see below).
const GPT_NANO_FOUNDRY = 'gpt-5.4-nano';

/**
 * Azure-Foundry target, bound to a credential/quota pool.
 *
 * `structuredMethod` defaults to `jsonSchema` because that is what DeepSeek
 * needs: its native tool-call format isn't normalized into OpenAI `tool_calls`,
 * so the function-calling parser chokes. It is a DEFAULT rather than a hardcode
 * because that constraint is DeepSeek's, not Foundry's — an OpenAI-family
 * deployment on the same surface (gpt-5.4-nano) has no such problem and does
 * better with native function calling.
 *
 * `pool` is what a stage draws its quota from and is independent of `model`: one
 * Azure resource can host several deployments, and one deployment can be served
 * from several resources. See llm-pools.ts.
 */
const foundry = (
  model: string,
  pool: Pool,
  thinkMode: ThinkMode = 'off',
  structuredMethod: StructuredMethod = 'jsonSchema'
): ModelTarget => ({
  provider: 'azure-foundry',
  model,
  pool,
  thinkMode,
  structuredMethod,
});

/**
 * The single source of truth for stage→model policy. Flipping LLM_VARIANT
 * selects one whole profile; no call site changes.
 *
 * Variant A reproduces the pre-refactor OpenAI mapping exactly, so the existing
 * test suite is a true regression gate.
 */
export const VARIANTS = {
  A: {
    cleaning: openai(OpenAIModels.GPT_5_4_NANO),
    classify: openai(OpenAIModels.GPT_5_4_NANO),
    check_completeness: openai(OpenAIModels.GPT_5_4_NANO),
    generate_followup: openai(OpenAIModels.GPT_5_4_NANO),
    tag_capabilities: openai(OpenAIModels.GPT_5_4_NANO),
    elicit_justification: openai(OpenAIModels.GPT_5_4_NANO),
    reflect: openai(OpenAIModels.GPT_5_4_NANO),
    refine: openai(OpenAIModels.GPT_5_4_NANO),
    generate_pdp: openai(OpenAIModels.GPT_5_4_NANO),
  },
  B: {
    cleaning: deepseek(DEEPSEEK_FLASH, 'off'),
    classify: deepseek(DEEPSEEK_FLASH, 'off'),
    check_completeness: deepseek(DEEPSEEK_FLASH, 'off'),
    generate_followup: deepseek(DEEPSEEK_FLASH, 'off'),
    tag_capabilities: deepseek(DEEPSEEK_FLASH, 'off'),
    elicit_justification: deepseek(DEEPSEEK_FLASH, 'off'),
    reflect: deepseek(DEEPSEEK_FLASH, 'off'),
    refine: deepseek(DEEPSEEK_FLASH, 'off'),
    generate_pdp: deepseek(DEEPSEEK_FLASH, 'off'),
  },
  C: {
    cleaning: deepseek(DEEPSEEK_PRO, 'off'),
    classify: deepseek(DEEPSEEK_PRO, 'off'),
    check_completeness: deepseek(DEEPSEEK_PRO, 'off'),
    generate_followup: deepseek(DEEPSEEK_PRO, 'off'),
    tag_capabilities: deepseek(DEEPSEEK_PRO, 'off'),
    elicit_justification: deepseek(DEEPSEEK_PRO, 'off'),
    reflect: deepseek(DEEPSEEK_PRO, 'off'),
    refine: deepseek(DEEPSEEK_PRO, 'off'),
    generate_pdp: deepseek(DEEPSEEK_PRO, 'off'),
  },
  // The only NON-UNIFORM profile — what the per-stage table was built for. Both
  // models run on Azure Foundry, but each stage group draws from its own
  // credential/quota pool:
  //
  //   cleaning  → GPT-5.4-nano, Pool.Interactive (1 key,  60 rpm)
  //   the rest  → DeepSeek V4 Flash, Pool.Analysis (2+ keys, 35 rpm each)
  //
  // Two independent reasons for the split. QUOTA: the pools are distinct Azure
  // resources with distinct caps, and a limiter can only honour a per-key cap if
  // it is per-key. WORKLOAD: cleaning is user-paced and blocks the message
  // appearing, while the other eight stages fire as a machine-paced ~9-call
  // burst — separate pools mean a burst can never starve the interactive path.
  // That second reason holds even if the caps later converge, so do NOT collapse
  // these back into one pool on the grounds that the numbers match.
  //
  // The eight graph stages run the SAME model as B over a different route, so
  // B-vs-D is a hosting-path comparison for those — but NOT for cleaning, which
  // deliberately changes model as well. Don't read D as a like-for-like B.
  D: {
    // Native function calling, not jsonSchema: the DSML workaround is DeepSeek's
    // constraint and nano doesn't share it (see the `foundry` helper).
    cleaning: foundry(GPT_NANO_FOUNDRY, Pool.Interactive, 'off', 'functionCalling'),
    classify: foundry(DEEPSEEK_FLASH_FOUNDRY, Pool.Analysis),
    check_completeness: foundry(DEEPSEEK_FLASH_FOUNDRY, Pool.Analysis),
    generate_followup: foundry(DEEPSEEK_FLASH_FOUNDRY, Pool.Analysis),
    tag_capabilities: foundry(DEEPSEEK_FLASH_FOUNDRY, Pool.Analysis),
    elicit_justification: foundry(DEEPSEEK_FLASH_FOUNDRY, Pool.Analysis),
    reflect: foundry(DEEPSEEK_FLASH_FOUNDRY, Pool.Analysis),
    refine: foundry(DEEPSEEK_FLASH_FOUNDRY, Pool.Analysis),
    generate_pdp: foundry(DEEPSEEK_FLASH_FOUNDRY, Pool.Analysis),
  },
  // Same gateway as B (OpenRouter), different model and upstream provider:
  // gpt-oss-120b on DeepInfra instead of DeepSeek V4 Flash on Atlas Cloud.
  // 'low' rather than 'off' because this model cannot run without reasoning
  // (see the gptOss helper) — so B vs E is NOT a like-for-like non-reasoning
  // comparison, it is "cheapest EU-portable model at its shippable setting"
  // vs the incumbent.
  E: {
    cleaning: gptOss(GPT_OSS_120B, 'low'),
    classify: gptOss(GPT_OSS_120B, 'low'),
    check_completeness: gptOss(GPT_OSS_120B, 'low'),
    generate_followup: gptOss(GPT_OSS_120B, 'low'),
    tag_capabilities: gptOss(GPT_OSS_120B, 'low'),
    elicit_justification: gptOss(GPT_OSS_120B, 'low'),
    reflect: gptOss(GPT_OSS_120B, 'low'),
    refine: gptOss(GPT_OSS_120B, 'low'),
    generate_pdp: gptOss(GPT_OSS_120B, 'low'),
  },
} satisfies Record<VariantKey, VariantProfile>;
