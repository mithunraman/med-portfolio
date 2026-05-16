import { Specialty, SpecialtyConfig } from '@acme/shared';
import { PSYCHIATRY_ENTRY_TYPES } from './psychiatry.entry-types';
import { PSYCHIATRY_CAPABILITIES } from './psychiatry.capabilities';
import { PSYCHIATRY_TEMPLATES } from './psychiatry.templates';
import { PSYCHIATRY_TRAINING_STAGES } from './psychiatry.training-stages';

export { PsychiatryEntryType } from './psychiatry.entry-types';

export const PSYCHIATRY_SPECIALTY_CONFIG: SpecialtyConfig = {
  specialty: Specialty.PSYCHIATRY,
  name: 'Psychiatry',
  entryTypes: PSYCHIATRY_ENTRY_TYPES,
  templates: PSYCHIATRY_TEMPLATES,
  capabilities: PSYCHIATRY_CAPABILITIES,
  trainingStages: PSYCHIATRY_TRAINING_STAGES,
};
