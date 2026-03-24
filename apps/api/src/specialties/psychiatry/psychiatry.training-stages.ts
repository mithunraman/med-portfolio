import { TrainingStageDefinition } from '@acme/shared';

export const PSYCHIATRY_TRAINING_STAGES: TrainingStageDefinition[] = [
  {
    code: 'CT1',
    label: 'Core Training Year 1',
    description:
      'First year of core psychiatry training. Learning psychiatric history taking, MSE, risk assessment, and prescribing under close supervision.',
  },
  {
    code: 'CT2',
    label: 'Core Training Year 2',
    description:
      'Broadening psychiatric experience, beginning psychotherapy exposure. Developing formulation skills and understanding unconscious dynamics.',
  },
  {
    code: 'CT3',
    label: 'Core Training Year 3',
    description:
      'Final year of core training. Preparing for MRCPsych exams and the critical progression point to higher specialty training.',
  },
  {
    code: 'ST4',
    label: 'Higher Training Year 1',
    description:
      'First year of higher specialty training in general adult psychiatry. Developing independent clinical practice and beginning to lead teams.',
  },
  {
    code: 'ST5',
    label: 'Higher Training Year 2',
    description:
      'Developing sub-specialty interests (rehabilitation, addiction, liaison), leadership skills, and supervising junior trainees.',
  },
  {
    code: 'ST6',
    label: 'Higher Training Year 3',
    description:
      'Final year before CCT. Approaching consultant-level practice with mastery of clinical reasoning, service leadership, and teaching.',
  },
];
