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

/**
 * Display label for an entry-type code, falling back to the code itself.
 *
 * Deliberately total where `getTemplateForEntryType` throws. A template is required
 * to do any work, so an unresolvable code there is a hard failure; a label is display
 * only, and showing the raw code beats failing the request that carries it. That keeps
 * a renamed or retired code from taking out an artefact list or a conversation payload
 * — `LEARNING_EVENT`, removed from `gp.entry-types.ts`, still renders on artefacts
 * created before the removal.
 *
 * Reads `SPECIALTY_CONFIGS` directly rather than via `getSpecialtyConfig`, which
 * throws for an inactive specialty. Callers must not have to try/catch a label.
 *
 * This makes only the *label* total; it does not make any route survive specialty
 * deactivation. `toArtefactDto` calls `getSpecialtyConfig` before it reaches this
 * resolver and throws, as do auth, review periods, and every graph node. Deactivating
 * a specialty that has live artefacts is unsupported app-wide, not partially handled here.
 *
 * Note this resolves for INACTIVE specialties too, unlike `isValidEntryType`, which
 * rejects them. Not an inconsistency — that one gates creation and must refuse a
 * deactivated specialty; this renders records that already exist, and they should not
 * decay into raw codes because their specialty was switched off after the fact.
 */
export function resolveEntryTypeLabel(specialty: Specialty, code: string): string {
  const entry = SPECIALTY_CONFIGS[specialty];
  return entry?.config.entryTypes.find((e) => e.code === code)?.label ?? code;
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
