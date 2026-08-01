/**
 * Every graph node that emits ANALYSIS_STEP_STARTED, surfaced to the client as
 * `thinkingReason` on the conversation context.
 *
 * Distinct from `InterruptNode` and a superset of it: this covers all nodes,
 * including the ones that never pause. It must list EVERY node that emits a step
 * — the value is parsed with `z.nativeEnum(ThinkingStep)` on the way out, so a
 * missing member is a response-validation failure, not a cosmetic gap.
 *
 * Ordered to follow the graph: gather → assess → elicit → tag → compose → save.
 */
export enum ThinkingStep {
  GATHER_CONTEXT = 'gather_context',
  CHECK_COMPLETENESS = 'check_completeness',
  REJECT_ENTRY = 'reject_entry',
  GENERATE_FOLLOWUP = 'generate_followup',
  ASK_FOLLOWUP = 'ask_followup',
  TAG_CAPABILITIES = 'tag_capabilities',
  PRESENT_CAPABILITIES = 'present_capabilities',
  ELICIT_JUSTIFICATION = 'elicit_justification',
  REFLECT = 'reflect',
  REFINE = 'refine',
  GENERATE_PDP = 'generate_pdp',
  SAVE = 'save',
}
