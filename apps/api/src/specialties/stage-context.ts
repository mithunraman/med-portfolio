import { Specialty } from '@acme/shared';

/**
 * Stage context paragraphs injected into LLM prompts to adjust coaching depth
 * based on the trainee's year of training.
 *
 * Each paragraph is 2-4 sentences describing the trainee's level and what the AI
 * should emphasise. The nodes receive this as a {trainingStageContext} variable.
 *
 * To add a new specialty, add entries to STAGE_CONTEXTS keyed by specialty + stage code.
 */
const STAGE_CONTEXTS: Partial<Record<Specialty, Record<string, string>>> = {
  [Specialty.GP]: {
    ST1: 'This trainee is in ST1, often rotating through hospital posts outside general practice. They are building foundational clinical skills. Frame questions around what they observed and learned. Help them connect hospital experiences to general practice principles — they may need help with RCGP curriculum mapping.',
    ST2: 'This trainee is in ST2, gaining GP experience and developing clinical reasoning. Ask questions that probe their decision-making and encourage them to consider the whole-patient context — family, social, and community factors. They should be developing their consultation skills and growing independence.',
    ST3: 'This trainee is in ST3, preparing for independent practice and the RCA exam. Challenge them with consultant-level thinking — managing uncertainty, leading the practice team, population health, and capability breadth. Expect well-reasoned clinical decisions and mature reflections.',
  },

  [Specialty.INTERNAL_MEDICINE]: {
    IMY1: 'This trainee is in IMY1 (ST4), the first year of IM Stage 2. They are building on their IMT foundation with increasing independence in acute take management and specialty ward care. Ask questions that probe their clinical reasoning and encourage them to articulate their approach to diagnostic uncertainty and comorbidity management.',

    IMY2: 'This trainee is in IMY2 (ST5), developing outpatient and ambulatory care skills alongside acute medicine. They should be leading MDT discharge planning and gaining procedural independence. Ask questions about team leadership, managing complexity across settings, and how they balance acute and long-term condition management.',

    IMY3: 'This trainee is in IMY3 (ST6), approaching CCT. They should be managing the acute unselected take unsupervised, leading resuscitation, and demonstrating consultant-level practice across all CiPs. Challenge them with questions about service-level thinking, teaching and supervision, and how they would act independently as a consultant physician.',
  },

  [Specialty.PSYCHIATRY]: {
    CT1: 'This trainee is in CT1, early in core psychiatry training. They are learning to take psychiatric histories, perform Mental State Examinations, and assess risk under close supervision. Ask specific, structured questions that help them articulate what they observed. They may need help identifying relevant clinical concepts and connecting observations to diagnostic frameworks.',
    CT2: 'This trainee is in CT2, broadening their psychiatric experience and beginning psychotherapy exposure. They should be developing formulation skills and understanding unconscious dynamics. Ask questions that encourage deeper psychological thinking beyond surface-level clinical description. They are expected to attend a Balint group.',
    CT3: 'This trainee is in CT3, preparing for MRCPsych and the critical progression point to higher training. They should demonstrate competent clinical reasoning, risk assessment, and prescribing rationale. Ask questions that test their ability to integrate biological, psychological, and social perspectives in formulation. They must have delivered therapy in at least two modalities.',
    ST4: 'This trainee is in ST4, the first year of higher specialty training in general adult psychiatry. They are developing independent clinical practice and beginning to lead teams. Ask questions that probe their clinical decision-making without prompting — they should be taking ownership of management plans and demonstrating confidence in risk assessment.',
    ST5: 'This trainee is in ST5, developing sub-specialty interests and leadership skills. Ask questions about service-level impact, team leadership, and how they are developing expertise in their area of interest (rehabilitation, addiction, or liaison). They should be supervising junior trainees and contributing to quality improvement.',
    ST6: 'This trainee is approaching CCT as a consultant psychiatrist. Probe leadership decisions, service-level thinking, and teaching/supervision skills. Expect mastery-level clinical reasoning, the ability to manage systemic complexity, and evidence of working across interfaces with other specialties. They should think and write like a consultant.',
  },
};

const GENERIC_FALLBACK =
  "Adjust your coaching to the trainee's apparent level of experience based on their language and clinical reasoning.";

/**
 * Returns the stage context paragraph for the given specialty and training stage.
 * Used by LLM nodes to inject stage-appropriate coaching instructions into prompts.
 *
 * Pure, synchronous lookup — no DB calls.
 */
export function getStageContext(specialty: Specialty, trainingStage: string): string {
  if (!trainingStage) return GENERIC_FALLBACK;

  const specialtyContexts = STAGE_CONTEXTS[specialty];
  if (!specialtyContexts) return GENERIC_FALLBACK;

  return specialtyContexts[trainingStage] ?? GENERIC_FALLBACK;
}

/**
 * Grading-oriented stage context — the calibration counterpart to STAGE_CONTEXTS.
 *
 * The question-voiced strings above ("Ask questions that probe…") are correct for the
 * follow-up node, which generates questions, but leak into a GRADING prompt as an
 * instruction it cannot act on. check_completeness therefore uses these calibration
 * paragraphs instead: same per-stage standard, phrased as "grade to this level" rather
 * than "ask about this". Keeping them separate lets the follow-up prompt stay unchanged.
 */
const GRADING_STAGE_CONTEXTS: Partial<Record<Specialty, Record<string, string>>> = {
  [Specialty.GP]: {
    ST1: 'This trainee is in ST1, often rotating through hospital posts outside general practice and building foundational clinical skills. Calibrate your grading to this level: credit sound observation and basic clinical reasoning; do not expect the independent decision-making or whole-patient breadth expected later in training. Judge each section against its Depth criteria at this foundational standard.',
    ST2: 'This trainee is in ST2, gaining GP experience and developing clinical reasoning. Calibrate your grading to this level: expect developing consultation skills and growing independence, not consultant-level sophistication. Give credit where the trainee\'s reasoning considers the whole-patient context — family, social, and community factors — but do not require it for a section to reach adequate unless that section\'s Depth criteria say so.',
    ST3: 'This trainee is in ST3, preparing for independent practice and the RCA exam. Calibrate your grading to this level: expect well-reasoned clinical decisions, comfort managing uncertainty, and mature reflection approaching independent-practice standard. Hold sections to this higher bar accordingly, but still judge each only against its Depth criteria.',
  },

  [Specialty.INTERNAL_MEDICINE]: {
    IMY1: 'This trainee is in IMY1 (ST4), the first year of IM Stage 2, building on their IMT foundation with increasing independence in acute take management and specialty ward care. Calibrate your grading to this level: expect developing independent reasoning around diagnostic uncertainty and comorbidity, not full consultant sophistication. Judge each section against its Depth criteria at this standard.',
    IMY2: 'This trainee is in IMY2 (ST5), developing outpatient and ambulatory care skills alongside acute medicine and leading MDT discharge planning. Calibrate your grading to this level: expect growing team leadership and management of complexity across settings. Judge each section against its Depth criteria at this standard.',
    IMY3: 'This trainee is in IMY3 (ST6), approaching CCT and managing the acute unselected take unsupervised. Calibrate your grading to this level: expect consultant-level practice, service-level thinking, and mature supervision and teaching. Hold sections to this higher bar, but judge each only against its Depth criteria.',
  },

  [Specialty.PSYCHIATRY]: {
    CT1: 'This trainee is in CT1, early in core psychiatry training, learning to take histories, perform Mental State Examinations, and assess risk under close supervision. Calibrate your grading to this level: credit structured observation and emerging formulation; do not expect independent or higher-training sophistication. Judge each section against its Depth criteria at this foundational standard.',
    CT2: 'This trainee is in CT2, broadening their psychiatric experience and beginning psychotherapy exposure, developing formulation skills. Calibrate your grading to this level: expect deeper psychological thinking beyond surface-level description, still developing. Judge each section against its Depth criteria at this standard.',
    CT3: 'This trainee is in CT3, preparing for MRCPsych and the progression to higher training. Calibrate your grading to this level: expect competent clinical reasoning, risk assessment, and integrated biological, psychological, and social formulation. Judge each section against its Depth criteria at this standard.',
    ST4: 'This trainee is in ST4, the first year of higher specialty training in general adult psychiatry, developing independent practice and beginning to lead teams. Calibrate your grading to this level: expect ownership of management plans and confident risk assessment. Judge each section against its Depth criteria at this standard.',
    ST5: 'This trainee is in ST5, developing sub-specialty interests and leadership skills and supervising junior trainees. Calibrate your grading to this level: expect service-level impact and developing expertise in their area. Judge each section against its Depth criteria at this standard.',
    ST6: 'This trainee is approaching CCT as a consultant psychiatrist. Calibrate your grading to this level: expect mastery-level clinical reasoning, management of systemic complexity, and consultant-standard leadership and teaching. Hold sections to this highest bar, but judge each only against its Depth criteria.',
  },
};

const GRADING_GENERIC_FALLBACK =
  "Calibrate your grading to the trainee's apparent level of experience based on their language and clinical reasoning, and judge each section only against its Depth criteria.";

/**
 * Returns the grading-calibration stage context for the given specialty and stage.
 * Used by check_completeness so the grading prompt calibrates to the trainee's level
 * without carrying the follow-up prompt's question-generation phrasing.
 *
 * Pure, synchronous lookup — no DB calls.
 */
export function getGradingStageContext(specialty: Specialty, trainingStage: string): string {
  if (!trainingStage) return GRADING_GENERIC_FALLBACK;

  const specialtyContexts = GRADING_STAGE_CONTEXTS[specialty];
  if (!specialtyContexts) return GRADING_GENERIC_FALLBACK;

  return specialtyContexts[trainingStage] ?? GRADING_GENERIC_FALLBACK;
}

/**
 * Formatting-calibration stage context — the counterpart for nodes that FORMAT rather
 * than question (reflect, and later generate_pdp). It names the stage neutrally so the
 * prompt's own calibration bullets can adjust cleanup depth, without carrying the
 * question-generation phrasing of getStageContext ("Ask questions that probe…") into a
 * non-questioning prompt.
 *
 * Deliberately terse: the reflect prompt's static bullets already encode the only
 * calibration needed (earlier-stage → more cleanup; later-stage → preserve precise
 * language), so this need only state which stage. Pure, synchronous — no DB calls.
 */
export function getFormattingStageContext(specialtyName: string, trainingStage: string): string {
  if (!trainingStage) {
    return "Calibrate formatting cleanup to the trainee's apparent level of experience.";
  }
  return `This trainee is in ${trainingStage}, training in ${specialtyName}.`;
}
