import { Specialty } from '../enums/specialty.enum';

/**
 * A section within an artefact template.
 * Defines what content is expected, how the LLM should generate it,
 * and what to ask the trainee if the information is missing.
 */
export interface TemplateSection {
  /** Unique identifier for this section (e.g., "clinical_reasoning") */
  id: string;
  /** Human-readable heading shown in the generated entry */
  label: string;
  /** Whether this section must be present for ARCP */
  required: boolean;
  /** What this section should contain (used for completeness checking) */
  description: string;
  /** Instruction for the LLM when generating this section */
  promptHint: string;
  /** Question to ask the trainee if this section's info is missing. Null = never ask. */
  extractionQuestion: string | null;
  /** Relative importance for quality scoring (weights within a template sum to 1.0) */
  weight: number;
}

/**
 * A template defining the structure of a specific artefact type.
 * Templates are the single source of truth for what a complete entry looks like.
 */
export interface ArtefactTemplate {
  /** Unique template identifier (e.g., "CCR_TEMPLATE") */
  id: string;
  /** Human-readable template name */
  name: string;
  /** Ordered list of sections that make up the entry */
  sections: TemplateSection[];
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
  /** Minimum required frequency (informational, for portfolio gap analysis) */
  frequency: string | null;
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
  /** Parent domain or category code, if applicable */
  domainCode: string | null;
  /** Parent domain or category name, if applicable */
  domainName: string | null;
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
  /** Mapping from entry type code to template ID */
  entryTypeToTemplate: Record<string, string>;
  /** All capabilities in the curriculum framework */
  capabilities: CapabilityDefinition[];
}
