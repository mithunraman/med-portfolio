import { MessageProcessingStatus } from '../enums/message-processing-status.enum';

/**
 * Human-readable labels for non-terminal processing statuses.
 * COMPLETE returns null (no label shown — content is displayed directly).
 * FAILED returns a fixed error string.
 */
export const PROCESSING_STATUS_LABELS: Record<MessageProcessingStatus, string | null> = {
  [MessageProcessingStatus.DELETED]: null,
  [MessageProcessingStatus.PENDING]: 'Queued',
  [MessageProcessingStatus.TRANSCRIBING]: 'Transcribing',
  [MessageProcessingStatus.CLEANING]: 'Processing',
  [MessageProcessingStatus.DEIDENTIFYING]: 'Processing',
  [MessageProcessingStatus.COMPLETE]: null,
  [MessageProcessingStatus.FAILED]: 'Failed',
};
