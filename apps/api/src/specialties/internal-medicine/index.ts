import { Specialty, SpecialtyConfig } from '@acme/shared';
import { IM_ENTRY_TYPES } from './im.entry-types';
import { IM_CAPABILITIES } from './im.capabilities';
import { IM_TEMPLATES, IM_ENTRY_TYPE_TO_TEMPLATE } from './im.templates';
import { IM_TRAINING_STAGES } from './im.training-stages';

export { ImEntryType } from './im.entry-types';

export const IM_SPECIALTY_CONFIG: SpecialtyConfig = {
  specialty: Specialty.INTERNAL_MEDICINE,
  name: 'Internal Medicine',
  entryTypes: IM_ENTRY_TYPES,
  templates: IM_TEMPLATES,
  entryTypeToTemplate: IM_ENTRY_TYPE_TO_TEMPLATE,
  capabilities: IM_CAPABILITIES,
  trainingStages: IM_TRAINING_STAGES,
};
