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
