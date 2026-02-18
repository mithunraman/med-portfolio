export enum MessageProcessingStatus {
  PENDING = 100,
  TRANSCRIBING = 200,
  CLEANING = 300,
  DEIDENTIFYING = 400,
  COMPLETE = 500,
  FAILED = 600,
}
