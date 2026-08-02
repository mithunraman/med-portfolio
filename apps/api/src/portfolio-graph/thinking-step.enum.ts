/**
 * Every graph node that emits ANALYSIS_STEP_STARTED.
 *
 * INTERNAL ONLY — these names must never reach a client. They would expose the
 * pipeline's node count and loop structure. They are persisted to
 * `analysisRun.currentStep` and logged (both good for debugging), then
 * translated to coarse public copy by `resolveThinkingLabel` in
 * ./thinking-labels.ts, which is the only thing that crosses the wire. That is
 * why this enum lives here and not in `packages/shared` — mobile bundles the
 * shared package, so anything exported from it ships inside the app binary.
 *
 * Distinct from `InterruptNode` and a superset of it: this covers all nodes,
 * including the ones that never pause. It must list EVERY node that emits a
 * step, so that STEP_LABELS (a total Record over this enum) stays complete.
 * Nothing validates responses on either side, so a step missing from here
 * degrades silently to "no label shown" rather than raising anything.
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
