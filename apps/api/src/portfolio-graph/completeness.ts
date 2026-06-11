import { Completeness } from '@acme/shared';
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
  const unmetSections = state.missingSections.map((sectionId) => {
    const tier = state.probeReadiness?.[sectionId]?.tier;
    const label = state.reflection?.find((s) => s.sectionId === sectionId)?.title ?? sectionId;
    // `missing` = no content at all; any covered-but-below-threshold tier is `shallow`.
    const status: 'missing' | 'shallow' = !tier || tier === 'missing' ? 'missing' : 'shallow';
    return { sectionId, label, status };
  });

  return { complete: state.hasEnoughInfo, unmetSections };
}
