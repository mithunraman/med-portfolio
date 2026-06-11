import { ArtefactStatus, type Artefact } from '@acme/shared';

export interface ArtefactAdvisory {
  /** Whether the artefact is in review with required sections still unmet. */
  incomplete: boolean;
  /** Display labels of the unmet sections (empty when complete). */
  labels: string[];
}

/**
 * Pure derivation of the "needs your input" advisory from an artefact.
 *
 * The banner shows only in IN_REVIEW — the one status where the signals exist
 * AND inline editing is enabled — so the nudge is always actionable. After
 * COMPLETED (finalised) or before review it stays silent.
 *
 * Two coexisting signals both flag the entry as not-yet-ready (deduped here so
 * the banner shows once): the legacy per-section `completeness`, and the graded
 * `draftStatus === 'needs_attention'` verdict (rubric not cleared / trainee
 * stopped early). `labels` may be empty when only the verdict fired.
 */
export function getArtefactAdvisory(artefact: Artefact): ArtefactAdvisory {
  const incomplete =
    artefact.status === ArtefactStatus.IN_REVIEW &&
    (artefact.completeness?.complete === false || artefact.draftStatus === 'needs_attention');
  const labels = artefact.completeness?.unmetSections.map((s) => s.label) ?? [];
  return { incomplete, labels };
}

/** Join labels into prose: ['A'] → 'A'; ['A','B'] → 'A and B'; ['A','B','C'] → 'A, B and C'. */
export function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
