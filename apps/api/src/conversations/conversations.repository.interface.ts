import {
  type Question,
  ArtefactStatus,
  MessageStatus,
  MessageRole,
  MessageType,
  Specialty,
} from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { DBError, Result } from '../common/utils/result.util';
import type { Conversation } from './schemas/conversation.schema';
import type { Message, TranscriptionMetadata } from './schemas/message.schema';

export const CONVERSATIONS_REPOSITORY = Symbol('CONVERSATIONS_REPOSITORY');

// Conversation types
export interface CreateConversationData {
  userId: Types.ObjectId;
  artefact: Types.ObjectId;
  title: string;
}

// Message types
export interface CreateMessageData {
  conversation: Types.ObjectId;
  userId: Types.ObjectId;
  role: MessageRole;
  messageType: MessageType;
  rawContent?: string | null;
  content?: string | null;
  status?: MessageStatus;
  media?: Types.ObjectId | null;
  question?: Question | null;
  idempotencyKey: string;
  /** Mark system-authored audit messages (e.g. recorded option selections). */
  generated?: boolean;
}

export interface UpdateMessageData {
  rawContent?: string | null;
  redactedContent?: string | null;
  content?: string | null;
  status?: MessageStatus;
  processingError?: string | null;
  transcription?: TranscriptionMetadata | null;
  answer?: Record<string, unknown> | null;
  editedAt?: Date | null;
  /** Bump whenever `rawContent` is rewritten — it restarts the retention clock. */
  rawContentWrittenAt?: Date | null;
}

export interface ListMessagesQuery {
  conversation: Types.ObjectId;
}

export interface ListMessagesResult {
  messages: Message[];
}

/**
 * The slice of the parent artefact that conversation-context computation needs.
 *
 * `specialty` and `artefactType` are the raw stored values — resolving them to a
 * display label is the service's job, not the repository's.
 */
export interface ArtefactRef {
  xid: string;
  status: ArtefactStatus;
  artefactType: string;
  specialty: Specialty;
}

export interface IConversationsRepository {
  // Conversation methods
  createConversation(
    data: CreateConversationData,
    session?: ClientSession
  ): Promise<Result<Conversation, DBError>>;

  findConversationById(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Conversation | null, DBError>>;

  findConversationByXid(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Conversation | null, DBError>>;

  findActiveConversationByArtefact(
    artefactId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Conversation | null, DBError>>;

  findActiveConversationsByArtefacts(
    artefactIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Map<string, Conversation>, DBError>>;

  // Message methods
  createMessage(
    data: CreateMessageData,
    session?: ClientSession
  ): Promise<Result<Message, DBError>>;

  /**
   * SYSTEM READ — intentionally NOT scoped by userId. Looks up a message by its
   * internal _id, which never originates from request input: callers are the
   * outbox processor (its entry lookup, before any user is known) and
   * conversation-context computation (user-agnostic). Both pass a server-derived
   * id. Do NOT wire this to a request-supplied id — use a userId-scoped read for
   * that. See "Ownership predicate at the persistence layer" in CLAUDE.md.
   */
  findMessageById(
    messageId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Message | null, DBError>>;

  /**
   * Find messages by their xids, scoped to a specific user.
   * Populates both media and conversation (for conversationXid resolution).
   */
  findMessagesByXids(
    xids: string[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Message[], DBError>>;

  updateMessage(
    messageId: Types.ObjectId,
    data: UpdateMessageData,
    session?: ClientSession
  ): Promise<Result<Message | null, DBError>>;

  /**
   * Update a message only while its `rawContent` is still present.
   *
   * For writes that persist content **derived** from `rawContent`. The retention
   * sweep can clear `rawContent` at any moment, including between a pipeline
   * stage reading it and that stage writing its output — so a blind write would
   * leave a row holding derived content whose source has been deleted.
   *
   * That state is not merely untidy, it is unreachable by the sweep:
   * `findExpiredRawContentBatchAcrossAllUsers` keys on `rawContent`, so a row
   * with `rawContent: null` and `redactedContent` set would be retained forever.
   * Folding the precondition into the query makes it atomic with the write,
   * exactly as `MESSAGE_LIVE_FILTER` does for tombstone resurrection.
   *
   * Returns null when the message is missing, deleted, or has been scrubbed —
   * all three mean the same thing to a caller: stop.
   */
  updateMessageIfRawContentPresent(
    messageId: Types.ObjectId,
    data: UpdateMessageData
  ): Promise<Result<Message | null, DBError>>;

  listMessages(
    query: ListMessagesQuery,
    session?: ClientSession
  ): Promise<Result<ListMessagesResult, DBError>>;

  /**
   * Check if any USER messages in a conversation are still being processed — i.e.
   * in any PROCESSING_MESSAGE_STATUSES (PENDING, TRANSCRIBING, CLEANING,
   * DEIDENTIFYING). Listed by phase, not execution order (redaction runs before
   * cleaning); membership is what matters, not the ordinal.
   */
  hasProcessingMessages(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<boolean, DBError>>;

  /**
   * Check if at least one COMPLETE USER message exists in a conversation.
   */
  hasCompleteMessages(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<boolean, DBError>>;

  /**
   * Get the role of the most recent message in a conversation.
   * Returns null if the conversation has no messages.
   */
  getLastMessageRole(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<MessageRole | null, DBError>>;

  /**
   * Whether a live ASSISTANT message exists after the given message (by _id) in
   * the conversation. Used to lock a message from edit/delete once the AI has
   * responded past it (i.e. it's been consumed by an analysis turn). Matches any
   * assistant message, including question-less terminal verdicts.
   */
  hasLaterAssistantMessage(
    conversationId: Types.ObjectId,
    messageId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<boolean, DBError>>;

  /**
   * Find a message by its idempotency key, scoped to a specific user.
   * Used for deduplication on retries.
   */
  findMessageByIdempotencyKey(
    userId: Types.ObjectId,
    idempotencyKey: string,
    session?: ClientSession
  ): Promise<Result<Message | null, DBError>>;

  /**
   * Resolve the artefact ref for a conversation by populating it. Returns null if
   * the conversation or artefact is missing.
   *
   * `specialty` is returned so the caller can resolve `artefactType` to a display
   * label; it is not itself exposed to clients.
   *
   * SYSTEM READ — intentionally NOT scoped by userId. The sole caller is
   * conversation-context computation, which is user-agnostic and passes an
   * owner-verified conversation._id (never request input). Do NOT wire this to
   * a request-supplied id without adding a userId predicate. See "Ownership
   * predicate at the persistence layer" in CLAUDE.md.
   */
  findArtefactRefByConversationId(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<ArtefactRef | null, DBError>>;

  /**
   * Return conversation IDs belonging to a user.
   */
  findConversationIdsByUser(userId: Types.ObjectId): Promise<Result<Types.ObjectId[], DBError>>;

  /**
   * Bulk tombstone all conversations and messages belonging to a user.
   * Returns the total number of modified documents.
   */
  markDeletedByUserId(userId: Types.ObjectId): Promise<Result<number, DBError>>;

  /**
   * Bulk tombstone conversations + scrub fields. Idempotent.
   */
  markDeleted(ids: Types.ObjectId[], session?: ClientSession): Promise<Result<number, DBError>>;

  /**
   * Resolve live conversation IDs for a set of artefact IDs.
   */
  findIdsByArtefactIds(
    artefactIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<Types.ObjectId[], DBError>>;

  /**
   * Bulk tombstone messages by their IDs. Idempotent.
   */
  markDeletedMessagesByIds(
    ids: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>>;

  /**
   * Bulk tombstone all messages belonging to the given conversations. Idempotent.
   */
  markDeletedMessagesByConversationIds(
    conversationIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>>;

  /**
   * Resolve message IDs across multiple conversations.
   */
  findMessageIdsByConversationIds(
    conversationIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<Types.ObjectId[], DBError>>;

  /**
   * Retention sweep (C-2) — INTENTIONALLY UNSCOPED BY USER.
   *
   * Every other read/write on this repository is filtered by `userId` as defence
   * in depth against IDOR. These two are the documented system-caller exception
   * from CLAUDE.md: a retention sweep must see every user's expired content, and
   * a `userId` predicate would defeat its entire purpose. The loud names are
   * deliberate — NEVER wire either of these to a controller route.
   *
   * Returns ids of messages that still hold raw content written before `cutoff`.
   * Matches the partial index predicate exactly so the scan stays indexed.
   */
  findExpiredRawContentBatchAcrossAllUsers(
    cutoff: Date,
    limit: number
  ): Promise<Result<Types.ObjectId[], DBError>>;

  /**
   * Retention sweep (C-2) — INTENTIONALLY UNSCOPED BY USER. See above.
   *
   * Nulls `rawContent`, `redactedContent` and the retention anchor. Never
   * touches `content` — the redacted, cleaned display text is what the trainee
   * actually sees, and keeping it is what makes DEC-11 hold.
   *
   * **`redactedContent` is reached through an invariant, not through the
   * finder's predicate.** The finder keys on `rawContent` alone, so this only
   * covers `redactedContent` while *"`redactedContent` never outlives
   * `rawContent`"* holds. That invariant is enforced at the write site by
   * `updateMessageIfRawContentPresent`, not assumed — a row with a populated
   * `redactedContent` and a null `rawContent` would be invisible to every future
   * sweep. Any new writer of `redactedContent` must preserve it.
   */
  scrubRawContentAcrossAllUsers(ids: Types.ObjectId[]): Promise<Result<number, DBError>>;
}
