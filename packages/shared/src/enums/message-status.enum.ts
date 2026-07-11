export enum MessageStatus {
  DELETED = -999,
  PENDING = 100,
  TRANSCRIBING = 200,
  CLEANING = 300,
  DEIDENTIFYING = 400,
  COMPLETE = 500,
  FAILED = 600,
  // Terminal: content was flagged as a prompt-injection attempt during processing.
  // rawContent is preserved, but the message is excluded from the AI transcript and
  // rendered as "not added" in the UI. Distinct from FAILED (a processing error).
  REJECTED = 700,
}
