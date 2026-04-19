import { Specialty, SpecialtyConfig, SpecialtyOption, SpecialtyRegistryEntry } from '@acme/shared';
import { GP_SPECIALTY_CONFIG } from './gp';
import { IM_SPECIALTY_CONFIG } from './internal-medicine';
import { PSYCHIATRY_SPECIALTY_CONFIG } from './psychiatry';

const SPECIALTY_CONFIGS: Partial<Record<Specialty, SpecialtyRegistryEntry>> = {
  [Specialty.GP]: { config: GP_SPECIALTY_CONFIG, isActive: true },
  [Specialty.INTERNAL_MEDICINE]: { config: IM_SPECIALTY_CONFIG, isActive: true },
  [Specialty.PSYCHIATRY]: { config: PSYCHIATRY_SPECIALTY_CONFIG, isActive: true },
};

export function getSpecialtyConfig(specialty: Specialty): SpecialtyConfig {
  const entry = SPECIALTY_CONFIGS[specialty];
  if (!entry || !entry.isActive) {
    throw new Error(`No active configuration found for specialty: ${specialty}`);
  }
  return entry.config;
}

export function getAllSpecialtyOptions(): SpecialtyOption[] {
  return Object.values(SPECIALTY_CONFIGS)
    .filter((entry): entry is SpecialtyRegistryEntry => entry !== undefined && entry.isActive)
    .map((entry) => ({
      specialty: entry.config.specialty,
      name: entry.config.name,
      trainingStages: entry.config.trainingStages,
    }));
}

export function isValidTrainingStage(specialty: Specialty, stageCode: string): boolean {
  const entry = SPECIALTY_CONFIGS[specialty];
  if (!entry || !entry.isActive) return false;
  return entry.config.trainingStages.some((s) => s.code === stageCode);
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

/** @internal — exposes all registered configs regardless of isActive, for test data integrity checks. */
export function getAllRegisteredConfigs(): SpecialtyConfig[] {
  return Object.values(SPECIALTY_CONFIGS)
    .filter((entry): entry is SpecialtyRegistryEntry => entry !== undefined)
    .map((entry) => entry.config);
}
