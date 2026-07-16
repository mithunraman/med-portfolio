import type { StatusVariant } from '@/components/StatusPill';
import { ArtefactStatus } from '@acme/shared';

interface StatusDisplay {
  label: string;
  variant: StatusVariant;
}

const STATUS_MAP: Record<ArtefactStatus, StatusDisplay> = {
  [ArtefactStatus.DELETED]: { label: 'Deleted', variant: 'default' },
  [ArtefactStatus.ARCHIVED]: { label: 'Archived', variant: 'default' },
  [ArtefactStatus.IN_CONVERSATION]: { label: 'In progress', variant: 'default' },
  [ArtefactStatus.IN_REVIEW]: { label: 'Needs review', variant: 'warning' },
  [ArtefactStatus.COMPLETED]: { label: 'Completed', variant: 'success' },
};

export function getArtefactStatusDisplay(status: ArtefactStatus): StatusDisplay {
  return STATUS_MAP[status] ?? { label: 'Unknown', variant: 'default' };
}

/**
 * Terminal-status descriptor for the detail-screen metadata line.
 *
 * Only states with no accompanying banner surface a word here: COMPLETED (a
 * positive, success-toned confirmation) and ARCHIVED (a muted note). IN_REVIEW
 * returns `null` because that state is carried by the guidance banner, not the
 * metadata line — which also keeps the word "review" out of the type/date line.
 */
export function getArtefactStatusMeta(status: ArtefactStatus): {
  word: string | null;
  tone: 'muted' | 'success';
} {
  switch (status) {
    case ArtefactStatus.COMPLETED:
      return { word: 'Completed', tone: 'success' };
    case ArtefactStatus.ARCHIVED:
      return { word: 'Archived', tone: 'muted' };
    default:
      return { word: null, tone: 'muted' };
  }
}
