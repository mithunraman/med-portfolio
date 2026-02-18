import type { Message } from '@acme/shared';
import type { MessageDocument } from '../schemas/message.schema';

export function toMessageDto(doc: MessageDocument, conversationXid: string): Message {
  return {
    id: doc.xid,
    conversationId: conversationXid,
    role: doc.role,
    content: doc.content,
    processingStatus: doc.processingStatus,
    hasMedia: !!doc.media,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
