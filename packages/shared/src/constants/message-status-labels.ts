import { MessageStatus } from '../enums/message-status.enum';

/**
 * Human-readable labels for non-terminal message statuses.
 * COMPLETE returns null (no label shown — content is displayed directly).
 * FAILED returns a fixed error string.
 */
export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string | null> = {
  [MessageStatus.DELETED]: null,
  [MessageStatus.PENDING]: 'Queued',
  [MessageStatus.TRANSCRIBING]: 'Transcribing',
  [MessageStatus.CLEANING]: 'Processing',
  [MessageStatus.DEIDENTIFYING]: 'Processing',
  [MessageStatus.COMPLETE]: null,
  [MessageStatus.FAILED]: 'Failed',
};
