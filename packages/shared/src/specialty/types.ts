import { Specialty } from '../enums/specialty.enum';

/** Readiness tier a probe/section must reach to count as complete. */
export type ReadinessTier = 'adequate' | 'strong';

/**
 * A probe is the leaf elicitation/scoring unit of a template.
 *
 * Probes drive targeted questions and per-dimension gap detection. Several
 * probes are composed into one OutputSection at render time (e.g. presentation,
 * reasoning, management and outcome all compose into "Brief description").
 *
 * Probes carry what TemplateSection historically carried; the only additions
 * are `descriptorCriteria` (graded-rubric depth cues, Phase 1) and the implicit
 * parent OutputSection that owns them.
 */
export interface Probe {
  /** Unique identifier for this probe (e.g., "clinical_reasoning") */
  id: string;
  /** Human-readable label (used in coaching + the readiness card) */
  label: string;
  /** Whether this probe must be present for ARCP */
  required: boolean;
  /** What this probe should contain (used for completeness checking) */
  description: string;
  /** Instruction for the renderer when organising this probe's content */
  promptHint: string;
  /** Question to ask the trainee if this probe's info is missing. Null = never ask. */
  extractionQuestion: string | null;
  /** Relative importance for quality scoring (weights within a template sum to 1.0) */
  weight: number;
  /**
   * What "strong" looks like for this probe, expressed against the RCGP word
   * descriptors. Drives graded depth scoring and targeted follow-up questions.
   * Optional during migration; required for graded probes.
   */
  descriptorCriteria?: string;
  /**
   * Minimum readiness tier this probe must reach to stop being a gap.
   * Defaults to 'adequate'; reflective/heavy probes set 'strong'.
   */
  threshold?: ReadinessTier;
}

/**
 * An output section is a field of the final document (e.g. the FourteenFish
 * "Brief description"). It owns one or more elicitation probes. The document
 * the trainee submits is the projection of probe content grouped by section.
 */
export interface OutputSection {
  /** Unique identifier for this document field (e.g., "brief_description") */
  id: string;
  /** Human-readable heading shown in the rendered entry */
  label: string;
  /** Render order within the document */
  order: number;
  /** Whether this field must be present for ARCP */
  required: boolean;
  /** Elicitation/scoring probes composed into this field */
  probes: Probe[];
}

/**
 * A template defining the structure of a specific artefact type.
 * Templates are the single source of truth for what a complete entry looks like.
 *
 * `sections` is the OUTPUT document shape; each section owns the granular probes
 * used for questioning and scoring. Use `leafProbes()` to iterate probes.
 */
export interface ArtefactTemplate {
  /** Unique template identifier (e.g., "CCR_TEMPLATE") */
  id: string;
  /** Human-readable template name */
  name: string;
  /** Ordered list of output sections (document fields) that make up the entry */
  sections: OutputSection[];
  /** Target word count range for the generated reflection */
  wordCountRange: { min: number; max: number };
}

/**
 * Definition of an entry type within a specialty's curriculum.
 */
export interface EntryTypeDefinition {
  /** Unique code for this entry type (e.g., "CLINICAL_CASE_REVIEW") */
  code: string;
  /** Human-readable label */
  label: string;
  /** Short description of what this entry type is */
  description: string;
  /** Which template to use for this entry type */
  templateId: string;
  /** Keywords and phrases that signal this entry type in a transcript */
  classificationSignals: string[];
}

/**
 * A capability or competency from the specialty's curriculum framework.
 */
export interface CapabilityDefinition {
  /** Capability code (e.g., "C-06" for RCGP) */
  code: string;
  /** Full name */
  name: string;
  /** Description of what this capability covers */
  description: string;
  /**
   * What "strong" justification looks like for this capability, expressed
   * against the RCGP word descriptors. Drives the linking question and grades
   * the trainee's justification (Phase 2). Optional during migration.
   */
  descriptorCriteria?: string;
  /**
   * Optional per-capability calibration examples injected into the tagging /
   * justification prompts. Leave unset for most capabilities — the generic
   * boundary exemplars in the node prompts handle the common failure modes.
   * Add entries here (driven by eval) only for a capability the generic
   * examples miscalibrate.
   */
  exemplars?: string[];
  /** Parent domain or category code, if applicable */
  domainCode: string | null;
  /** Parent domain or category name, if applicable */
  domainName: string | null;
}

/**
 * A training stage within a specialty's programme.
 * Used to drive stage-appropriate AI coaching and to populate
 * the specialty/stage picker on the mobile client.
 */
export interface TrainingStageDefinition {
  /** Short code used as the stored value (e.g., "CT1", "ST3") */
  code: string;
  /** Human-readable label (e.g., "Core Training Year 1") */
  label: string;
  /** Description of this stage — what the trainee is doing, used as helper text in UI */
  description: string;
}

/**
 * Shape returned by GET /api/specialties — one per supported specialty.
 * Drives the mobile onboarding picker without hardcoding lists on the client.
 */
export interface SpecialtyOption {
  specialty: Specialty;
  name: string;
  trainingStages: TrainingStageDefinition[];
}

/**
 * Wraps a SpecialtyConfig with an activation flag.
 * Only active entries are exposed to users and used in core business logic.
 */
export interface SpecialtyRegistryEntry {
  config: SpecialtyConfig;
  isActive: boolean;
}

/**
 * Complete configuration for a medical training specialty.
 * This is the "fuel" that drives the specialty-agnostic processing graph.
 * Each specialty (GP, Emergency Medicine, Psychiatry, etc.) provides one of these.
 */
export interface SpecialtyConfig {
  /** Which specialty this config is for */
  specialty: Specialty;
  /** Human-readable specialty name */
  name: string;
  /** All entry types for this specialty */
  entryTypes: EntryTypeDefinition[];
  /** All templates, keyed by template ID */
  templates: Record<string, ArtefactTemplate>;
  /** All capabilities in the curriculum framework */
  capabilities: CapabilityDefinition[];
  /** Training stages for this specialty (e.g., ST1-ST3 for GP, CT1-CT3 + ST4-ST6 for Psychiatry) */
  trainingStages: TrainingStageDefinition[];
}
