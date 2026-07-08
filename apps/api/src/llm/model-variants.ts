import { OpenAIModels, type ModelTarget } from './llm.service';

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

/** Known A/B variants. Expands to 'A' | 'B' | 'C' in later phases. */
export type VariantKey = 'A';

/** A variant is a complete stage→target mapping — every stage must be present. */
export type VariantProfile = Record<Stage, ModelTarget>;

const openai = (model: string): ModelTarget => ({ provider: 'openai', model });

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
} satisfies Record<VariantKey, VariantProfile>;
