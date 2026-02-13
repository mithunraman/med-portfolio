import type { Conversation } from '@acme/shared';
import type { ConversationDocument } from '../schemas/conversation.schema';
import { extractConversationId } from '../utils/conversation-id.util';

export function toConversationDto(doc: ConversationDocument): Conversation {
  return {
    id: doc.xid,
    conversationId: extractConversationId(doc.conversationId),
    title: doc.title,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
