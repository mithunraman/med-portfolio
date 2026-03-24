import { TrainingStageDefinition } from '@acme/shared';

export const IM_TRAINING_STAGES: TrainingStageDefinition[] = [
  {
    code: 'IMY1',
    label: 'Internal Medicine Year 1 (ST4)',
    description:
      'First year of IM Stage 2 training. Building on IMT foundation with increasing independence in acute take management and specialty ward care.',
  },
  {
    code: 'IMY2',
    label: 'Internal Medicine Year 2 (ST5)',
    description:
      'Second year. Developing outpatient and ambulatory care skills, leading MDT discharge planning, and gaining procedural independence.',
  },
  {
    code: 'IMY3',
    label: 'Internal Medicine Year 3 (ST6)',
    description:
      'Final year approaching CCT. Expected to manage the acute unselected take unsupervised, lead resuscitation, and demonstrate consultant-level practice across all CiPs.',
  },
];
