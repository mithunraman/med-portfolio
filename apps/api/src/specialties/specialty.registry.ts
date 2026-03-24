import { Specialty, SpecialtyConfig, SpecialtyOption } from '@acme/shared';
import { GP_SPECIALTY_CONFIG } from './gp';
import { IM_SPECIALTY_CONFIG } from './internal-medicine';
import { PSYCHIATRY_SPECIALTY_CONFIG } from './psychiatry';

const SPECIALTY_CONFIGS: Partial<Record<Specialty, SpecialtyConfig>> = {
  [Specialty.GP]: GP_SPECIALTY_CONFIG,
  [Specialty.INTERNAL_MEDICINE]: IM_SPECIALTY_CONFIG,
  [Specialty.PSYCHIATRY]: PSYCHIATRY_SPECIALTY_CONFIG,
};

export function getSpecialtyConfig(specialty: Specialty): SpecialtyConfig {
  const config = SPECIALTY_CONFIGS[specialty];
  if (!config) {
    throw new Error(`No configuration found for specialty: ${specialty}`);
  }
  return config;
}

export function getAllSpecialtyOptions(): SpecialtyOption[] {
  return Object.values(SPECIALTY_CONFIGS)
    .filter((config): config is SpecialtyConfig => config !== undefined)
    .map((config) => ({
      specialty: config.specialty,
      name: config.name,
      trainingStages: config.trainingStages,
    }));
}

export function isValidTrainingStage(specialty: Specialty, stageCode: string): boolean {
  const config = SPECIALTY_CONFIGS[specialty];
  if (!config) return false;
  return config.trainingStages.some((s) => s.code === stageCode);
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
