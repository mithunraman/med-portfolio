import { MessageProcessingStatus, MessageRole, MessageType } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { Result } from '../common/utils/result.util';
import type { ConversationDocument } from './schemas/conversation.schema';
import type { MessageDocument, TranscriptionMetadata } from './schemas/message.schema';

export const CONVERSATIONS_REPOSITORY = Symbol('CONVERSATIONS_REPOSITORY');

export interface DBError {
  code: string;
  message: string;
}

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
  processingStatus?: MessageProcessingStatus;
  media?: Types.ObjectId | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateMessageData {
  rawContent?: string | null;
  cleanedContent?: string | null;
  content?: string | null;
  processingStatus?: MessageProcessingStatus;
  processingError?: string | null;
  transcription?: TranscriptionMetadata | null;
}

export interface ListMessagesQuery {
  conversation: Types.ObjectId;
  cursor?: Types.ObjectId;
  limit: number;
}

export interface ListMessagesResult {
  messages: MessageDocument[];
}

export interface IConversationsRepository {
  // Conversation methods
  createConversation(
    data: CreateConversationData,
    session?: ClientSession
  ): Promise<Result<ConversationDocument, DBError>>;

  findConversationById(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<ConversationDocument | null, DBError>>;

  findConversationByXid(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<ConversationDocument | null, DBError>>;

  findActiveConversationByArtefact(
    artefactId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<ConversationDocument | null, DBError>>;

  findActiveConversationsByArtefacts(
    artefactIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<Map<string, ConversationDocument>, DBError>>;

  // Message methods
  createMessage(
    data: CreateMessageData,
    session?: ClientSession
  ): Promise<Result<MessageDocument, DBError>>;

  findMessageById(
    messageId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<MessageDocument | null, DBError>>;

  /**
   * Find messages by their xids, scoped to a specific user.
   * Populates both media and conversation (for conversationXid resolution).
   */
  findMessagesByXids(
    xids: string[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<MessageDocument[], DBError>>;

  updateMessage(
    messageId: Types.ObjectId,
    data: UpdateMessageData,
    session?: ClientSession
  ): Promise<Result<MessageDocument | null, DBError>>;

  listMessages(
    query: ListMessagesQuery,
    session?: ClientSession
  ): Promise<Result<ListMessagesResult, DBError>>;

  /**
   * Check if any USER messages in a conversation are still being processed
   * (status < COMPLETE, i.e. PENDING, TRANSCRIBING, CLEANING, DEIDENTIFYING).
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
}
