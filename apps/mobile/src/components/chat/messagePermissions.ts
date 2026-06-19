import type { Message } from '@acme/shared';
import { ArtefactStatus, MessageRole, MessageStatus, MessageType } from '@acme/shared';

/**
 * Client-side gating for editing/deleting a chat message. The backend no longer
 * publishes a per-message capability flag — availability is composed here from
 * message facts + the conversation's artefact status. The edit/delete endpoints
 * independently authorize the same rules.
 *
 * Shared conditions (both edit and delete):
 *  - the user's own message (role USER)
 *  - a text or audio message (not, e.g., an option-selection audit message)
 *  - not system-generated
 *  - the artefact is still IN_CONVERSATION
 *  - the AI is not actively analysing
 *  - the AI has not yet responded after this message — i.e. the message was
 *    sent after the latest assistant message (including question-less terminal
 *    verdicts). Once the AI has replied past it, the message has been consumed
 *    by an analysis turn and is locked. Mirrors the server's
 *    `hasLaterAssistantMessage` guard.
 *
 * Edit additionally requires COMPLETE; delete also permits FAILED (so a message
 * that failed to process can be cleared).
 */
const MODIFIABLE_TYPES = new Set<MessageType>([MessageType.TEXT, MessageType.AUDIO]);

function isOwnModifiableMessage(
  message: Message,
  artefactStatus: ArtefactStatus | null | undefined,
  isAnalysing: boolean,
  latestAssistantMessageAt: string | undefined
): boolean {
  return (
    message.role === MessageRole.USER &&
    !message.generated &&
    MODIFIABLE_TYPES.has(message.messageType) &&
    artefactStatus === ArtefactStatus.IN_CONVERSATION &&
    !isAnalysing &&
    // createdAt is an ISO string — lexicographic order matches chronological.
    (!latestAssistantMessageAt || message.createdAt > latestAssistantMessageAt)
  );
}

export function canEditMessage(
  message: Message,
  artefactStatus: ArtefactStatus | null | undefined,
  isAnalysing: boolean,
  latestAssistantMessageAt: string | undefined
): boolean {
  return (
    isOwnModifiableMessage(message, artefactStatus, isAnalysing, latestAssistantMessageAt) &&
    message.status === MessageStatus.COMPLETE
  );
}

export function canDeleteMessage(
  message: Message,
  artefactStatus: ArtefactStatus | null | undefined,
  isAnalysing: boolean,
  latestAssistantMessageAt: string | undefined
): boolean {
  return (
    isOwnModifiableMessage(message, artefactStatus, isAnalysing, latestAssistantMessageAt) &&
    (message.status === MessageStatus.COMPLETE || message.status === MessageStatus.FAILED)
  );
}
