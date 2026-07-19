export enum MessageStatus {
  DELETED = -999,
  PENDING = 100,
  TRANSCRIBING = 200,
  // NOTE: ordinals group phases (every processing state sorts below COMPLETE) but
  // deliberately do NOT encode execution ORDER — redaction (DEIDENTIFYING) runs
  // BEFORE cleaning (CLEANING), so a message's ordinal can decrease mid-pipeline.
  // Never build a "status only advances" guard on these values; use the sets below.
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

/**
 * The non-terminal, in-flight processing statuses — a USER message in any of these
 * is still being worked on by the pipeline. Defined explicitly (membership, not an
 * ordinal `> DELETED && < COMPLETE` range) so it stays correct when the pipeline
 * reorders: the enum ordinals do NOT encode execution order (see the note on the
 * enum). Single source of truth for "is this message still processing?" checks.
 */
export const PROCESSING_MESSAGE_STATUSES: ReadonlySet<MessageStatus> = new Set([
  MessageStatus.PENDING,
  MessageStatus.TRANSCRIBING,
  MessageStatus.CLEANING,
  MessageStatus.DEIDENTIFYING,
]);
