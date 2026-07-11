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

/**
 * Statuses at which a message will never advance further. Single source of truth for
 * every "is this message done?" check — e.g. the mobile poll loop's convergence test
 * and per-bubble rendering. Add any new terminal status here so both consumers pick it
 * up; a missing entry silently keeps the poll loop running forever.
 */
export const TERMINAL_MESSAGE_STATUSES: ReadonlySet<MessageStatus> = new Set([
  MessageStatus.COMPLETE,
  MessageStatus.FAILED,
  MessageStatus.REJECTED,
]);

export function isTerminalMessageStatus(status: MessageStatus): boolean {
  return TERMINAL_MESSAGE_STATUSES.has(status);
}
