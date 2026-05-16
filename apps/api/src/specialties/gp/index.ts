import { Specialty, SpecialtyConfig } from '@acme/shared';
import { GP_ENTRY_TYPES } from './gp.entry-types';
import { GP_CAPABILITIES } from './gp.capabilities';
import { GP_TEMPLATES } from './gp.templates';
import { GP_TRAINING_STAGES } from './gp.training-stages';

export { GpEntryType } from './gp.entry-types';

export const GP_SPECIALTY_CONFIG: SpecialtyConfig = {
  specialty: Specialty.GP,
  name: 'General Practice',
  entryTypes: GP_ENTRY_TYPES,
  templates: GP_TEMPLATES,
  capabilities: GP_CAPABILITIES,
  trainingStages: GP_TRAINING_STAGES,
};
