import { Specialty, SpecialtyConfig } from '@acme/shared';
import { GP_SPECIALTY_CONFIG } from './gp';

const SPECIALTY_CONFIGS: Partial<Record<Specialty, SpecialtyConfig>> = {
  [Specialty.GP]: GP_SPECIALTY_CONFIG,
};

export function getSpecialtyConfig(specialty: Specialty): SpecialtyConfig {
  const config = SPECIALTY_CONFIGS[specialty];
  if (!config) {
    throw new Error(`No configuration found for specialty: ${specialty}`);
  }
  return config;
}

export function getTemplateForEntryType(config: SpecialtyConfig, entryTypeCode: string) {
  const templateId = config.entryTypeToTemplate[entryTypeCode];
  if (!templateId) {
    throw new Error(
      `No template mapping for entry type "${entryTypeCode}" in specialty "${config.name}"`
    );
  }
  const template = config.templates[templateId];
  if (!template) {
    throw new Error(`Template "${templateId}" not found in specialty "${config.name}"`);
  }
  return template;
}
