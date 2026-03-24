import { TrainingStageDefinition } from '@acme/shared';

export const GP_TRAINING_STAGES: TrainingStageDefinition[] = [
  {
    code: 'ST1',
    label: 'GP Specialty Training Year 1',
    description:
      'Usually hospital rotations (A&E, paediatrics, psychiatry, etc.). Building foundational clinical skills in settings outside general practice.',
  },
  {
    code: 'ST2',
    label: 'GP Specialty Training Year 2',
    description:
      'Mix of hospital and GP placements. Developing clinical reasoning, consultation skills, and growing independence in primary care.',
  },
  {
    code: 'ST3',
    label: 'GP Specialty Training Year 3',
    description:
      'Predominantly in GP practice. Preparing for independent practice, AKT/RCA exams, and demonstrating breadth across all capabilities.',
  },
];
