import { ReadinessSnapshot, Specialty } from '@acme/shared';
import { getSpecialtyConfig, getTemplateForEntryType } from '../specialties/specialty.registry';
import { PortfolioStateType } from './portfolio-graph.state';

/**
 * Build the Entry Card readiness snapshot from graph state.
 *
 * Pure projection (registry lookups only, no I/O). Rides on the question
 * message each turn so the client can render the live readiness card. Section
 * labels come from the template; the composed document is empty until the entry
 * has been organised by the reflect node.
 */
export function buildReadinessSnapshot(state: PortfolioStateType): ReadinessSnapshot | undefined {
  if (!state.entryType) return undefined;

  const config = getSpecialtyConfig(Number(state.specialty) as Specialty);
  const template = getTemplateForEntryType(config, state.entryType);

  const labelBySection = new Map(template.sections.map((s) => [s.id, s.label]));

  const sections = Object.entries(state.sectionReadiness ?? {}).map(([sectionId, r]) => ({
    sectionId,
    label: labelBySection.get(sectionId) ?? sectionId,
    tier: r.tier,
    meetsThreshold: r.meetsThreshold,
  }));

  const capabilities = (state.capabilities ?? []).map((c) => ({
    code: c.code,
    name: c.name,
    justified: Boolean(c.justificationStrong),
  }));

  return {
    score: state.readinessScore ?? 0,
    draftStatus: state.draftStatus ?? 'in_progress',
    sections,
    capabilities,
    document: state.composedDocument ?? [],
  };
}
