import type { Message } from '@acme/shared';
import type { MessageDocument } from '../schemas/message.schema';

export function toMessageDto(doc: MessageDocument, conversationId: string): Message {
  return {
    id: doc.xid,
    conversationId,
    role: doc.role,
    content: doc.content,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
