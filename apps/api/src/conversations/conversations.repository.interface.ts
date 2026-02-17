import { MessageRole } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { Result } from '../common/utils/result.util';
import type { ConversationDocument } from './schemas/conversation.schema';
import type { MessageDocument } from './schemas/message.schema';

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
  role: MessageRole;
  content: string;
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

  listMessages(
    query: ListMessagesQuery,
    session?: ClientSession
  ): Promise<Result<ListMessagesResult, DBError>>;
}
