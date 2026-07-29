import { OpenAIModels, type ModelTarget, type ThinkMode } from './llm.service';

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
export type VariantKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

/** A variant is a complete stage→target mapping — every stage must be present. */
export type VariantProfile = Record<Stage, ModelTarget>;

const openai = (model: string): ModelTarget => ({ provider: 'openai', model });

// Variant B: DeepSeek V4 Flash served through OpenRouter, pinned to Alibaba Cloud
// Int. as the upstream inference provider (OpenRouter slug `alibaba`) for every
// stage — its Flash endpoint supports tools, reasoning, and structured_outputs.
const DEEPSEEK_FLASH = 'deepseek/deepseek-v4-flash';
const DEEPSEEK_PRO = 'deepseek/deepseek-v4-pro';
// OpenRouter upstream inference provider slugs (from openrouter.ai/api/v1/providers).

// const ALIBABA_ROUTE = ['alibaba'];
const ATLAS_CLOUD_ROUTE = ['atlas-cloud'];
// Cloudflare (OpenRouter slug `cloudflare`). Serves V4 Flash at 384k context —
// smaller than the 1M most providers offer, but far above anything this pipeline
// sends. Verified live against the exact request shape this file produces
// (provider.only + reasoning:{enabled:false} + response_format json_schema
// strict, two system messages): 200, reasoning_tokens 0, schema + enum honoured.
//
// Verify per-provider rather than trusting OpenRouter's capability flags — they
// are wrong in both directions. Atlas Cloud advertises `response_format` and
// still 400s on json_schema for some models; Cloudflare does NOT advertise
// `response_format` at all, yet honours it.
const CLOUDFLARE_ROUTE = ['cloudflare'];

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
  route: string[] = ATLAS_CLOUD_ROUTE
): ModelTarget => ({
  provider: 'openrouter',
  model,
  thinkMode,
  route,
  structuredMethod: 'jsonSchema',
});

// Variant D: DeepSeek V4 Flash served through Azure AI Foundry's OpenAI-compatible
// endpoint (a first-party-cloud alternative to the OpenRouter route in B). The
// value is the Foundry *deployment name*, not a catalog slug — set it to whatever
// the deployment is called in your Foundry resource.
const DEEPSEEK_FLASH_FOUNDRY = 'DeepSeek-V4-Flash';

/**
 * DeepSeek-on-Azure-Foundry target with a per-stage reasoning ("think") mode.
 *
 * Like the OpenRouter helper, uses `jsonSchema` structured output rather than
 * tool-calling: DeepSeek's native tool-call format isn't normalized into OpenAI
 * `tool_calls`, so the function-calling parser chokes. Foundry advertises
 * `json_schema` structured outputs, which constrains the response to the schema.
 */
const foundry = (model: string, thinkMode: ThinkMode): ModelTarget => ({
  provider: 'azure-foundry',
  model,
  thinkMode,
  structuredMethod: 'jsonSchema',
});

// Variant F: OpenAI's open-weight gpt-oss-120b served through OpenRouter, pinned to
// DeepInfra's turbo endpoint. First variant to move off the DeepSeek family entirely, so F vs B
// isolates the MODEL (gpt-oss vs V4 Flash) rather than the route — the axis D and E
// already cover. 117B MoE, ~5.1B active, so it prices and paces like a small model.
//
// Unlike B/C/D/E, F runs WITH reasoning on (see the profile below) — gpt-oss is a
// native reasoning model, so a non-thinking baseline would not be a fair read of it.
const GPT_OSS_120B = 'openai/gpt-oss-120b';
// DeepInfra's `turbo` endpoint. Note the SUFFIXED slug: `provider.only` matches ALL of
// a provider's endpoints when given a bare slug (`deepinfra` would also allow bf16), so
// the `/turbo` suffix is what actually pins the variant. Verified against OpenRouter's
// provider-routing docs 2026-07-29 — `only`/`order` accept `provider_slug/variant`.
//
// Endpoint facts (openrouter.ai/api/v1/models/openai/gpt-oss-120b/endpoints, 2026-07-29):
// $0.15/$0.60 per 1M, 131,072 ctx, and — unlike the two providers tried before it —
// supported_parameters advertises BOTH `response_format` and `structured_outputs`,
// which is the whole ballgame for a pipeline where every node calls invokeStructured.
//
// VERIFIED WORKING 2026-07-29 — full journey, 21 consecutive calls, every one
// finish_reason `stop`. No truncation, no 400s, no 429s. Measured envelope:
//   · input   1,195 – 3,531 tokens
//   · output  117 – 1,729 tokens  ⇒ peak is ~11% of turbo's 16,384 cap
//   · cost    ~$0.0007/call ⇒ ~$0.018 per 27-call journey (Cerebras ran ~$0.08)
//   · speed   75 – 328 tok/s ⇒ ~3-7s per call (Cerebras was ~2,400 tok/s; turbo is
//             roughly 10x slower, which is the price of everything above working)
//
// OUTPUT CAP 16,384 — the lowest of any endpoint pinned here, and well below the
// 131,072 that deepinfra/bf16 offers at a quarter of the price. On the numbers above
// it is not close to binding, so it is a documented limit rather than a live risk.
// Two things follow. (1) The nodes' 20,000 maxTokens + 4k `low` headroom = 24,000 is
// larger than turbo will honour, but since real output peaks at 1,729 the request
// never approaches either number — maxTokens is decorative on this route. (2) There is
// ~9x headroom against observed usage, so raising reasoning effort is affordable HERE
// in a way it never was on Cerebras (8,192 cap, see graveyard). If a stage needs
// deeper reasoning, this is the route that can pay for it — re-measure after.
//
// PROVIDER GRAVEYARD for this model — both failed, keep them recorded:
//  · Cerebras (`cerebras/fp16`) — two independent, measured failures. (1) Output
//    clamped at 8,192, NOT the advertised 40,960: a check_completeness call stopped at
//    exactly 8,192 with finish_reason `length` against a 28,000 budget, making maxTokens
//    and reasoningHeadroom both inert and leaving reasoning EFFORT the only lever —
//    which is why F still sits at `low` (see gptOss below). (2) Its JSON-schema
//    validator rejects `maxItems` on arrays outright: `Invalid fields for schema with
//    types ['array']: {'maxItems'}`, code `wrong_api_format`, triggered by the `.max(3)`
//    on generate_followup's hints.examples. If a stage ever 400s with `wrong_api_format`,
//    that Zod constraint is the first thing to check.
//  · Amazon Bedrock (`amazon-bedrock`) — advertises NEITHER `response_format` nor
//    `structured_outputs`, and the flags were right: it does not reject the parameter,
//    it IGNORES it and returns prose, so the cleaning stage died on
//    `Unexpected token 'T', "The patien"... is not valid JSON`. Silent ignore is worse
//    than a 400 — nothing fails until the parser does. Its `amazon-bedrock/eu-west-1`
//    sibling (Ireland, EEA — the only EEA-soil endpoint on this model) shares the same
//    missing flags, so residency via Bedrock is not available for gpt-oss regardless.
//    For an EU-resident endpoint that DOES support structured outputs, use `nebius`.
const DEEPINFRA_TURBO_ROUTE = ['deepinfra/turbo'];

/**
 * gpt-oss-on-OpenRouter target. Same wire shape as the DeepSeek helper but kept
 * separate because the reasoning semantics differ and shouldn't be conflated.
 *
 * Uses `jsonSchema` structured output for the same reason as DeepSeek: it constrains
 * the response to be the schema JSON itself, sidestepping any tool-call normalisation
 * the endpoint may not perform. deepinfra/turbo advertises both `response_format` and
 * `structured_outputs` — but verify live before trusting it (see the CLOUDFLARE_ROUTE
 * note above: OpenRouter's capability flags are wrong in both directions, and this
 * pipeline has now been burned by a provider whose flags were right and one whose
 * flags were wrong).
 *
 * NB on `thinkMode`: gpt-oss is natively a reasoning model with an always-on analysis
 * channel, unlike DeepSeek V4's hybrid toggle — so F reasons rather than running the
 * `off` the DeepSeek variants use. It sits at `low`, and that is deliberate.
 *
 * `high` was tried on Cerebras and FAILED. Reasoning tokens share the completion
 * budget, so a high-effort think on the large nested schemas — check_completeness
 * (assignments[] + sectionGrades[]) and generate_followup (hints.examples[]) — ate
 * the budget before the JSON closed. The response truncated mid-object and LangChain
 * threw "Could not parse response content as the length limit was reached". Note the
 * asymmetry that made this confusing to diagnose: cleaning and classify kept working
 * throughout, because their schemas are flat and small enough to survive on what is
 * left. Measured envelope from that run: successful outputs of 537 / 2,013 / 2,089 /
 * 2,678 / 4,430 tokens, against the one high-effort call that hit 8,192 and died.
 *
 * turbo caps output at 16,384 — higher than Cerebras's 8,192 but still a real ceiling,
 * so `low` is kept as the default. The underlying dynamic is unchanged either way:
 * reasoning expands to fill whatever budget it is given, and these schemas are large.
 * Raise it deliberately and re-measure, not on the assumption that headroom is free.
 *
 * Reasoning tokens are also billed as output, so F's cost per journey is NOT
 * comparable to B/C/D/E on headline per-token price; measure it, don't infer it.
 *
 * Do NOT reach for `max` here: it maps to `reasoning:{effort:'xhigh'}`, which is
 * DeepSeek's effort vocabulary. gpt-oss takes low/medium/high, so `xhigh` is liable to
 * be rejected or silently coerced.
 */
const gptOss = (model: string, thinkMode: ThinkMode): ModelTarget => ({
  provider: 'openrouter',
  model,
  thinkMode,
  route: DEEPINFRA_TURBO_ROUTE,
  structuredMethod: 'jsonSchema',
});

// Variant G: gpt-oss-120b served NATIVELY by Cloudflare Workers AI — the SAME model as F
// (which runs it on DeepInfra via OpenRouter), so G-vs-F is a clean provider A/B (Cloudflare
// vs DeepInfra) for one model. The Cloudflare model id carries an `@cf/` prefix (distinct
// from the OpenRouter slug `openai/gpt-oss-120b`).
//
// (Gemma 4 was tried here first and abandoned: Cloudflare Workers AI serves it
// non-deterministically — shared-GPU queueing gives multi-minute latency spikes / 408s and
// intermittently ignores the thinking-disable, per Cloudflare's own capacity docs + the
// documented Jun-2026 gemma-4-26b-a4b-it incident. Not our bug, and unfixable client-side.)
const GPT_OSS_120B_CF = '@cf/openai/gpt-oss-120b';

/**
 * gpt-oss-on-Cloudflare (native Workers AI) target. Reasoning rides as the standard OpenAI
 * `reasoning_effort` (see cloudflareKwargs), NOT chat-template kwargs — gpt-oss is a native
 * reasoning model, so like Variant F it runs at `low` effort (see the gptOss note: `high` is
 * harmful on the large nested schemas, `off` is not a real option). `functionCalling` matches
 * what proved reliable on Cloudflare's structured-output path over strict json_schema.
 */
const cloudflareGptOss = (model: string = GPT_OSS_120B_CF): ModelTarget => ({
  provider: 'cloudflare',
  model,
  thinkMode: 'low',
  structuredMethod: 'functionCalling',
});

// Variant H: Z.ai's GLM-4.7-Flash served NATIVELY by Cloudflare Workers AI — same transport
// as G (native Workers AI, `reasoning_effort`, function-calling structured output), different
// MODEL. So H-vs-G isolates the model (GLM-4.7-Flash vs gpt-oss-120b) on one provider, the way
// F-vs-B isolates model on OpenRouter. The Cloudflare id carries the `@cf/` prefix.
//
// Model facts (developers.cloudflare.com/workers-ai/models/glm-4.7-flash, 2026-07-29):
// $0.06/$0.40 per 1M in/out, 131,072 ctx, multilingual, native tool-calling. It is a
// reasoning model that takes `reasoning_effort`, so like F/G it runs at `low` (deep reasoning
// on the large nested schemas eats the completion budget — see the gptOss note).
const GLM_4_7_FLASH_CF = '@cf/zai-org/glm-4.7-flash';

/**
 * GLM-4.7-Flash-on-Cloudflare target. Identical shape to cloudflareGptOss — reasoning rides as
 * `reasoning_effort` (see cloudflareKwargs) and structured output uses `functionCalling`, which
 * is what proved reliable on Cloudflare's path over strict json_schema. Kept as its own helper
 * so the model-specific reasoning notes stay attached to the right model.
 */
const cloudflareGlm = (model: string = GLM_4_7_FLASH_CF): ModelTarget => ({
  provider: 'cloudflare',
  model,
  thinkMode: 'low',
  structuredMethod: 'functionCalling',
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
    classify: openai(OpenAIModels.GPT_4_1_MINI),
    check_completeness: openai(OpenAIModels.GPT_4_1_MINI),
    generate_followup: openai(OpenAIModels.GPT_4_1),
    tag_capabilities: openai(OpenAIModels.GPT_4_1_MINI),
    elicit_justification: openai(OpenAIModels.GPT_4_1),
    reflect: openai(OpenAIModels.GPT_4_1),
    refine: openai(OpenAIModels.GPT_5_4),
    generate_pdp: openai(OpenAIModels.GPT_4_1),
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
  // Same model as B (DeepSeek V4 Flash), different route: Azure AI Foundry instead
  // of OpenRouter. Enables a clean A/B of the two hosting paths for the same model.
  D: {
    cleaning: foundry(DEEPSEEK_FLASH_FOUNDRY, 'off'),
    classify: foundry(DEEPSEEK_FLASH_FOUNDRY, 'off'),
    check_completeness: foundry(DEEPSEEK_FLASH_FOUNDRY, 'off'),
    generate_followup: foundry(DEEPSEEK_FLASH_FOUNDRY, 'off'),
    tag_capabilities: foundry(DEEPSEEK_FLASH_FOUNDRY, 'off'),
    elicit_justification: foundry(DEEPSEEK_FLASH_FOUNDRY, 'off'),
    reflect: foundry(DEEPSEEK_FLASH_FOUNDRY, 'off'),
    refine: foundry(DEEPSEEK_FLASH_FOUNDRY, 'off'),
    generate_pdp: foundry(DEEPSEEK_FLASH_FOUNDRY, 'off'),
  },
  E: {
    cleaning: deepseek(DEEPSEEK_FLASH, 'off', CLOUDFLARE_ROUTE),
    classify: deepseek(DEEPSEEK_FLASH, 'off', CLOUDFLARE_ROUTE),
    check_completeness: deepseek(DEEPSEEK_FLASH, 'off', CLOUDFLARE_ROUTE),
    generate_followup: deepseek(DEEPSEEK_FLASH, 'off', CLOUDFLARE_ROUTE),
    tag_capabilities: deepseek(DEEPSEEK_FLASH, 'off', CLOUDFLARE_ROUTE),
    elicit_justification: deepseek(DEEPSEEK_FLASH, 'off', CLOUDFLARE_ROUTE),
    reflect: deepseek(DEEPSEEK_FLASH, 'off', CLOUDFLARE_ROUTE),
    refine: deepseek(DEEPSEEK_FLASH, 'off', CLOUDFLARE_ROUTE),
    generate_pdp: deepseek(DEEPSEEK_FLASH, 'off', CLOUDFLARE_ROUTE),
  },
  // Different MODEL, not just a different route: gpt-oss-120b via OpenRouter pinned
  // to deepinfra/turbo, with reasoning ON. B/D/E all serve the same DeepSeek weights over
  // three different paths; F is the first profile that changes what is actually doing
  // the thinking, so a B-vs-F delta is a model-quality signal rather than a hosting one
  // — with the caveat that it moves reasoning mode at the same time (see gptOss above).
  F: {
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
  // gpt-oss-120b via NATIVE Cloudflare Workers AI, low reasoning. Same model as F
  // (DeepInfra), so G-vs-F isolates the PROVIDER (Cloudflare vs DeepInfra) for one model.
  G: {
    cleaning: cloudflareGptOss(),
    classify: cloudflareGptOss(),
    check_completeness: cloudflareGptOss(),
    generate_followup: cloudflareGptOss(),
    tag_capabilities: cloudflareGptOss(),
    elicit_justification: cloudflareGptOss(),
    reflect: cloudflareGptOss(),
    refine: cloudflareGptOss(),
    generate_pdp: cloudflareGptOss(),
  },
  // GLM-4.7-Flash via NATIVE Cloudflare Workers AI, low reasoning. Same provider+transport as
  // G, different model — so H-vs-G isolates the MODEL (GLM-4.7-Flash vs gpt-oss-120b).
  H: {
    cleaning: cloudflareGlm(),
    classify: cloudflareGlm(),
    check_completeness: cloudflareGlm(),
    generate_followup: cloudflareGlm(),
    tag_capabilities: cloudflareGlm(),
    elicit_justification: cloudflareGlm(),
    reflect: cloudflareGlm(),
    refine: cloudflareGlm(),
    generate_pdp: cloudflareGlm(),
  },
} satisfies Record<VariantKey, VariantProfile>;
