import type { StatusVariant } from '@/components/StatusPill';
import { ArtefactStatus } from '@acme/shared';

interface StatusDisplay {
  label: string;
  variant: StatusVariant;
}

const STATUS_MAP: Record<ArtefactStatus, StatusDisplay> = {
  [ArtefactStatus.ARCHIVED]: { label: 'Archived', variant: 'default' },
  [ArtefactStatus.IN_CONVERSATION]: { label: 'In progress', variant: 'default' },
  [ArtefactStatus.IN_REVIEW]: { label: 'Needs review', variant: 'warning' },
  [ArtefactStatus.COMPLETED]: { label: 'Completed', variant: 'success' },
};

export function getArtefactStatusDisplay(status: ArtefactStatus): StatusDisplay {
  return STATUS_MAP[status] ?? { label: 'Unknown', variant: 'default' };
}
