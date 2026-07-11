import { OpenAIModels, type ModelTarget, type ThinkMode } from './llm.service';

/**
 * The pipeline stages that make an LLM call. A stage names *itself* when it
 * resolves a model, so the concrete provider/model lives in exactly one place
 * (the VARIANTS table) rather than being hardcoded at each call site.
 */
export const Stage = {
  Cleaning: 'cleaning',
  Redaction: 'redaction',
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
export type VariantKey = 'A' | 'B' | 'C';

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
    redaction: openai(OpenAIModels.GPT_5_4_NANO),
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
    redaction: deepseek(DEEPSEEK_FLASH, 'off'),
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
    redaction: deepseek(DEEPSEEK_PRO, 'off'),
    classify: deepseek(DEEPSEEK_PRO, 'off'),
    check_completeness: deepseek(DEEPSEEK_PRO, 'off'),
    generate_followup: deepseek(DEEPSEEK_PRO, 'off'),
    tag_capabilities: deepseek(DEEPSEEK_PRO, 'off'),
    elicit_justification: deepseek(DEEPSEEK_PRO, 'off'),
    reflect: deepseek(DEEPSEEK_PRO, 'off'),
    refine: deepseek(DEEPSEEK_PRO, 'off'),
    generate_pdp: deepseek(DEEPSEEK_PRO, 'off'),
  },
} satisfies Record<VariantKey, VariantProfile>;
