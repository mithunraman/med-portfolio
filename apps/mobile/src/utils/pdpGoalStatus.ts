import type { StatusVariant } from '@/components/StatusPill';
import { PdpGoalStatus } from '@acme/shared';

interface StatusDisplay {
  label: string;
  variant: StatusVariant;
}

const STATUS_MAP: Record<number, StatusDisplay> = {
  [PdpGoalStatus.NOT_STARTED]: { label: 'Not started', variant: 'processing' },
  [PdpGoalStatus.STARTED]: { label: 'Started', variant: 'success' },
  [PdpGoalStatus.COMPLETED]: { label: 'Completed', variant: 'info' },
  [PdpGoalStatus.ARCHIVED]: { label: 'Archived', variant: 'default' },
};

export function getPdpGoalStatusDisplay(status: PdpGoalStatus): StatusDisplay {
  return STATUS_MAP[status] ?? { label: 'Unknown', variant: 'default' };
}
