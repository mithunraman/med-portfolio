import { Specialty, SpecialtyConfig } from '@acme/shared';
import { GP_ENTRY_TYPES } from './gp.entry-types';
import { GP_CAPABILITIES } from './gp.capabilities';
import { GP_TEMPLATES, GP_ENTRY_TYPE_TO_TEMPLATE } from './gp.templates';

export { GpEntryType } from './gp.entry-types';

export const GP_SPECIALTY_CONFIG: SpecialtyConfig = {
  specialty: Specialty.GP,
  name: 'General Practice',
  entryTypes: GP_ENTRY_TYPES,
  templates: GP_TEMPLATES,
  entryTypeToTemplate: GP_ENTRY_TYPE_TO_TEMPLATE,
  capabilities: GP_CAPABILITIES,
};
