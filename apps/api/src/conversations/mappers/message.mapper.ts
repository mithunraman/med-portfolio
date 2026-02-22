import type { Message, MessageMedia } from '@acme/shared';
import type { MediaDocument } from '../../media/schemas/media.schema';
import type { MessageDocument } from '../schemas/message.schema';

export function toMessageDto(
  doc: MessageDocument,
  conversationXid: string,
  mediaData: MessageMedia | null = null
): Message {
  return {
    id: doc.xid,
    conversationId: conversationXid,
    role: doc.role,
    messageType: doc.messageType,
    processingStatus: doc.processingStatus,
    // Resolve best available content across pipeline stages
    content: doc.content ?? doc.cleanedContent ?? doc.rawContent ?? null,
    media: mediaData,
    metadata: doc.metadata ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Build the media payload from a populated MessageDocument.
 * The caller is responsible for providing the presigned audioUrl (or null).
 */
export function buildMediaData(doc: MessageDocument, audioUrl: string | null): MessageMedia | null {
  if (!doc.media) return null;
  const mediaDoc = doc.media as unknown as MediaDocument;
  return {
    id: mediaDoc.xid,
    mimeType: mediaDoc.mimeType,
    sizeBytes: mediaDoc.sizeBytes,
    durationMs: mediaDoc.durationMs,
    audioUrl,
  };
}
