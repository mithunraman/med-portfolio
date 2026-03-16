export enum ThinkingStep {
  GATHER_CONTEXT = 'gather_context',
  CLASSIFY = 'classify',
  PRESENT_CLASSIFICATION = 'present_classification',
  ASK_FOLLOWUP = 'ask_followup',
  TAG_CAPABILITIES = 'tag_capabilities',
  PRESENT_CAPABILITIES = 'present_capabilities',
  CHECK_COMPLETENESS = 'check_completeness',
  REFLECT = 'reflect',
  GENERATE_PDP = 'generate_pdp',
  SAVE = 'save',
}
