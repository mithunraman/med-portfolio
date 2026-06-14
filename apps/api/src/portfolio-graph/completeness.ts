import { Completeness, leafProbes, Specialty } from '@acme/shared';
import { getSpecialtyConfig, getTemplateForEntryType } from '../specialties/specialty.registry';
import { PortfolioStateType } from './portfolio-graph.state';

/**
 * Derive the artefact completeness signal from the graph's final state.
 *
 * Pure function (no I/O). It reads the last completeness assessment that
 * `check_completeness` produced — which persists unchanged through the rest of
 * the run — and shapes it for the artefact:
 *  - `complete` mirrors `hasEnoughInfo` (zero unmet required sections).
 *  - each unmet section gets a display label (from the reflection titles, falling
 *    back to the section id) and a reason: `missing` (no content) or `shallow`
 *    (mentioned but too thin).
 *
 * General across section types: a thin factual section and a thin reflection both
 * surface here. Only assessable (required + askable) sections can appear, because
 * those are the only ones `missingSections` tracks.
 */
export function deriveCompleteness(state: PortfolioStateType): Completeness {
  // Nothing unmet → no labels to resolve, so skip the template lookup entirely.
  if (state.missingSections.length === 0) {
    return { complete: state.hasEnoughInfo, unmetSections: [] };
  }

  // Resolve display labels from the template (the source of probe labels), since
  // the per-probe content is no longer carried on the artefact.
  const labelByProbe = buildProbeLabelMap(state);

  const unmetSections = state.missingSections.map((sectionId) => {
    const tier = state.probeReadiness?.[sectionId]?.tier;
    const label = labelByProbe.get(sectionId) ?? sectionId;
    // `missing` = no content at all; any covered-but-below-threshold tier is `shallow`.
    const status: 'missing' | 'shallow' = !tier || tier === 'missing' ? 'missing' : 'shallow';
    return { sectionId, label, status };
  });

  return { complete: state.hasEnoughInfo, unmetSections };
}

/** Map probe id → label from the entry's template (empty if no entry type yet). */
function buildProbeLabelMap(state: PortfolioStateType): Map<string, string> {
  if (!state.entryType) return new Map();
  const config = getSpecialtyConfig(Number(state.specialty) as Specialty);
  const template = getTemplateForEntryType(config, state.entryType);
  return new Map(leafProbes(template).map((p) => [p.id, p.label]));
}
