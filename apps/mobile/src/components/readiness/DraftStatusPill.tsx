import type { DraftStatus } from '@acme/shared';
import { memo } from 'react';
import { StatusPill, type StatusVariant } from '../StatusPill';

/** Maps the graded draft verdict → pill copy + variant. */
const DRAFT_STATUS_META: Record<DraftStatus, { label: string; variant: StatusVariant }> = {
  in_progress: { label: 'In progress', variant: 'processing' },
  ready: { label: 'ARCP ready', variant: 'success' },
  needs_attention: { label: 'Needs attention', variant: 'warning' },
};

interface Props {
  status: DraftStatus;
}

/**
 * Renders the draft readiness verdict as a coloured pill.
 * Thin wrapper over the shared StatusPill so copy/variant live in one place.
 */
export const DraftStatusPill = memo(function DraftStatusPill({ status }: Props) {
  const meta = DRAFT_STATUS_META[status];
  return <StatusPill label={meta.label} variant={meta.variant} />;
});
