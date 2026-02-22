import {
  ConversationStatus,
  MessageProcessingStatus,
  MessageRole,
  MessageType,
} from '@acme/shared';
import { Model, Types } from 'mongoose';
import { ConversationDocument } from '../../schemas/conversation.schema';
import { MessageDocument } from '../../schemas/message.schema';

/**
 * Factory helpers for creating test documents directly in MongoDB.
 * These bypass the service layer so we can set up precise preconditions.
 */

let conversationModel: Model<ConversationDocument>;
let messageModel: Model<MessageDocument>;

/** Initialise the factories with Mongoose models from the test module. */
export function initFactories(
  convModel: Model<ConversationDocument>,
  msgModel: Model<MessageDocument>
) {
  conversationModel = convModel;
  messageModel = msgModel;
}

// ── Shared test user/artefact IDs ──

export const TEST_USER_ID = new Types.ObjectId();
export const TEST_USER_ID_STR = TEST_USER_ID.toString();
export const TEST_ARTEFACT_ID = new Types.ObjectId();

// ── Conversation factory ──

export async function createTestConversation(
  overrides: Partial<{
    userId: Types.ObjectId;
    artefact: Types.ObjectId;
    title: string;
    status: ConversationStatus;
  }> = {}
): Promise<ConversationDocument> {
  const [doc] = await conversationModel.create([
    {
      userId: overrides.userId ?? TEST_USER_ID,
      artefact: overrides.artefact ?? TEST_ARTEFACT_ID,
      title: overrides.title ?? 'Test Conversation',
      status: overrides.status ?? ConversationStatus.ACTIVE,
    },
  ]);
  return doc;
}

// ── Message factory ──

export async function createTestMessage(
  conversationId: Types.ObjectId,
  overrides: Partial<{
    userId: Types.ObjectId;
    role: MessageRole;
    messageType: MessageType;
    rawContent: string | null;
    cleanedContent: string | null;
    content: string | null;
    processingStatus: MessageProcessingStatus;
    metadata: Record<string, unknown> | null;
  }> = {}
): Promise<MessageDocument> {
  const [doc] = await messageModel.create([
    {
      conversation: conversationId,
      userId: overrides.userId ?? TEST_USER_ID,
      role: overrides.role ?? MessageRole.USER,
      messageType: overrides.messageType ?? MessageType.TEXT,
      rawContent: overrides.rawContent ?? 'I saw a patient today with type 2 diabetes.',
      cleanedContent: overrides.cleanedContent ?? null,
      content: overrides.content ?? 'I saw a patient today with type 2 diabetes.',
      processingStatus: overrides.processingStatus ?? MessageProcessingStatus.COMPLETE,
      metadata: overrides.metadata ?? null,
    },
  ]);
  return doc;
}

/** Shorthand: create a COMPLETE USER TEXT message. */
export async function createCompleteUserMessage(
  conversationId: Types.ObjectId,
  content: string
): Promise<MessageDocument> {
  return createTestMessage(conversationId, {
    content,
    rawContent: content,
    processingStatus: MessageProcessingStatus.COMPLETE,
  });
}

/** Shorthand: create a PENDING USER TEXT message. */
export async function createPendingUserMessage(
  conversationId: Types.ObjectId,
  content: string
): Promise<MessageDocument> {
  return createTestMessage(conversationId, {
    content: null,
    rawContent: content,
    processingStatus: MessageProcessingStatus.PENDING,
  });
}

/** Manually set a message's processing status (simulates ProcessingService completing). */
export async function markMessageComplete(
  messageId: Types.ObjectId,
  content: string
): Promise<void> {
  await messageModel.updateOne(
    { _id: messageId },
    {
      $set: {
        processingStatus: MessageProcessingStatus.COMPLETE,
        content,
        cleanedContent: content,
      },
    }
  );
}

/** Get all messages for a conversation, sorted chronologically. */
export async function getMessagesForConversation(
  conversationId: Types.ObjectId
): Promise<MessageDocument[]> {
  return messageModel.find({ conversation: conversationId }).sort({ _id: 1 }).lean();
}
