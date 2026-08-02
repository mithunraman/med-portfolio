import { ThinkingStep } from './thinking-step.enum';

// Server-owned display copy: changing these ships by deploy, not by App Store
// review. Framed on the entry and on the system's own work — never on clinical
// judgment of the patient or of the trainee's practice. See MOB-044.
//
// Several steps deliberately share one string. That duplication IS the
// coarsening: the client sees "Preparing a question" three times in a row and
// cannot tell which node produced it, so the pipeline's node count and loop
// structure stay unobservable. Constants rather than repeated literals keep the
// grouping explicit and make a typo in one of three copies impossible.
const READING = 'Reading your entry';
const REVIEWING = "Reviewing what you've written";
const PREPARING_QUESTION = 'Preparing a question';
const MATCHING = 'Matching capabilities';
const WRITING_UP = 'Polishing up your entry';
const FINISHING = 'Finishing up';

// Total over ThinkingStep: adding a graph node must break this build.
const STEP_LABELS: Record<ThinkingStep, string> = {
  [ThinkingStep.GATHER_CONTEXT]: READING,
  [ThinkingStep.CHECK_COMPLETENESS]: REVIEWING,
  [ThinkingStep.GENERATE_FOLLOWUP]: PREPARING_QUESTION,
  [ThinkingStep.ASK_FOLLOWUP]: PREPARING_QUESTION,
  [ThinkingStep.ELICIT_JUSTIFICATION]: MATCHING,
  [ThinkingStep.TAG_CAPABILITIES]: MATCHING,
  [ThinkingStep.PRESENT_CAPABILITIES]: MATCHING,
  [ThinkingStep.REFLECT]: WRITING_UP,
  [ThinkingStep.REFINE]: WRITING_UP,
  [ThinkingStep.GENERATE_PDP]: FINISHING,
  [ThinkingStep.SAVE]: FINISHING,
  [ThinkingStep.REJECT_ENTRY]: FINISHING,
};

/**
 * Translate an internal graph step into the public label shown to the trainee.
 *
 * Takes `string`, not `ThinkingStep`, because `currentStep` is persisted as a
 * plain string ({@link ThinkingStep} is not enforced at the emit site). Returns
 * null for absent or unmapped values — the client then shows no label line,
 * which is the intended graceful degradation rather than an error.
 */
export function resolveThinkingLabel(step: string | null | undefined): string | null {
  if (!step) return null;
  return STEP_LABELS[step as ThinkingStep] ?? null;
}
