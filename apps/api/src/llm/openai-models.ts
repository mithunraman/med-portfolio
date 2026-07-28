/**
 * OpenAI model identifiers, extracted to a leaf module so the VARIANTS table
 * (model-variants.ts) can reference them without importing llm.service.ts — which
 * would create a runtime import cycle (llm.service → resolver → model-config →
 * model-variants → llm.service) that leaves this const undefined at load time.
 */
export const OpenAIModels = {
  GPT_5_4: 'gpt-5.4',
  GPT_5_4_NANO: 'gpt-5.4-nano',
  GPT_4_1: 'gpt-4.1',
  GPT_4_1_MINI: 'gpt-4.1-mini',
} as const;

export type OpenAIModel = (typeof OpenAIModels)[keyof typeof OpenAIModels];
