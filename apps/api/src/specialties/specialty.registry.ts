import {
  EntryTypeOption,
  Specialty,
  SpecialtyConfig,
  SpecialtyOption,
  SpecialtyRegistryEntry,
} from '@acme/shared';
import { GP_SPECIALTY_CONFIG } from './gp';
import { IM_SPECIALTY_CONFIG } from './internal-medicine';
import { PSYCHIATRY_SPECIALTY_CONFIG } from './psychiatry';

const SPECIALTY_CONFIGS: Partial<Record<Specialty, SpecialtyRegistryEntry>> = {
  [Specialty.GP]: { config: GP_SPECIALTY_CONFIG, isActive: true },
  [Specialty.INTERNAL_MEDICINE]: { config: IM_SPECIALTY_CONFIG, isActive: false },
  [Specialty.PSYCHIATRY]: { config: PSYCHIATRY_SPECIALTY_CONFIG, isActive: false },
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
      entryTypes: toEntryTypeOptions(entry.config),
    }));
}

export function isValidTrainingStage(specialty: Specialty, stageCode: string): boolean {
  const entry = SPECIALTY_CONFIGS[specialty];
  if (!entry || !entry.isActive) return false;
  return entry.config.trainingStages.some((s) => s.code === stageCode);
}

/**
 * Whether `code` is an entry type of an ACTIVE specialty. Sibling of
 * isValidTrainingStage — the boundary check that lets everything downstream treat
 * an entry type as a trusted value (see `getTemplateForEntryType`, which throws).
 */
export function isValidEntryType(specialty: Specialty, code: string): boolean {
  const entry = SPECIALTY_CONFIGS[specialty];
  if (!entry || !entry.isActive) return false;
  return entry.config.entryTypes.some((e) => e.code === code);
}

/** Project config entry types onto the public option shape (drops server-only fields). */
function toEntryTypeOptions(config: SpecialtyConfig): EntryTypeOption[] {
  return config.entryTypes.map((e) => ({
    code: e.code,
    label: e.label,
    description: e.description,
  }));
}

export function getTemplateForEntryType(config: SpecialtyConfig, entryTypeCode: string) {
  const entryType = config.entryTypes.find((e) => e.code === entryTypeCode);
  if (!entryType) {
    throw new Error(`Entry type "${entryTypeCode}" not found in specialty "${config.name}"`);
  }
  const template = config.templates[entryType.templateId];
  if (!template) {
    throw new Error(`Template "${entryType.templateId}" not found in specialty "${config.name}"`);
  }
  return template;
}

/** @internal — exposes all registered configs regardless of isActive, for test data integrity checks. */
export function getAllRegisteredConfigs(): SpecialtyConfig[] {
  return Object.values(SPECIALTY_CONFIGS)
    .filter((entry): entry is SpecialtyRegistryEntry => entry !== undefined)
    .map((entry) => entry.config);
}
