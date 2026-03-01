import type { StatusVariant } from '@/components/StatusPill';
import { ArtefactStatus } from '@acme/shared';

interface StatusDisplay {
  label: string;
  variant: StatusVariant;
}

const STATUS_MAP: Record<ArtefactStatus, StatusDisplay> = {
  [ArtefactStatus.DRAFT]: { label: 'Draft', variant: 'default' },
  [ArtefactStatus.PROCESSING]: { label: 'Processing', variant: 'processing' },
  [ArtefactStatus.REVIEW]: { label: 'Needs review', variant: 'warning' },
  [ArtefactStatus.FINAL]: { label: 'Ready to export', variant: 'success' },
  [ArtefactStatus.EXPORTED]: { label: 'Exported', variant: 'info' },
};

export function getArtefactStatusDisplay(status: ArtefactStatus): StatusDisplay {
  return STATUS_MAP[status] ?? { label: 'Unknown', variant: 'default' };
}
