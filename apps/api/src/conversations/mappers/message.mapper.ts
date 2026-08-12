import type { Answer, Message, MessageMedia } from '@acme/shared';
import type { Media } from '../../media/schemas/media.schema';
import type { Message as MessageSchema } from '../schemas/message.schema';

export function toMessageDto(
  doc: MessageSchema,
  conversationXid: string,
  mediaData: MessageMedia | null = null
): Message {
  return {
    id: doc.xid,
    conversationId: conversationXid,
    role: doc.role,
    messageType: doc.messageType,
    status: doc.status,
    // Resolve best available content across pipeline stages, falling back to a
    // placeholder once the retention sweep (C-2) has removed the raw copies.
    //
    // The anchor is set on every insert by a schema default and cleared ONLY by
    // that sweep, so its absence is an exact "raw copy removed" signal — an
    // in-flight audio message, which also has no content yet, still has its
    // anchor and correctly renders null.
    //
    // This is computed rather than stored on purpose. Writing '[deleted]' into
    // `rawContent` would make it truthy, and processing.service.ts branches on
    // exactly that (`else if (message.rawContent)`), so a scrubbed message
    // retried by the outbox would be redacted, cleaned and marked COMPLETE with
    // the placeholder as its content. It would also keep scrubbed rows inside
    // the partial index with no legal way to exclude them.
    //
    // Only ever surfaces on REJECTED/FAILED, where the trainee's own words were
    // the sole thing on display — COMPLETE messages keep `content`.
    content:
      doc.content ??
      doc.redactedContent ??
      doc.rawContent ??
      (doc.rawContentWrittenAt ? null : '[deleted]'),
    media: mediaData,
    question: doc.question ?? null,
    answer: (doc.answer as Answer) ?? null,
    idempotencyKey: doc.idempotencyKey ?? null,
    generated: doc.generated ?? false,
    editedAt: doc.editedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Build the media payload from a populated Message with media.
 * The caller is responsible for providing the presigned audioUrl (or null).
 */
export function buildMediaData(doc: MessageSchema, audioUrl: string | null): MessageMedia | null {
  if (!doc.media) return null;
  const mediaDoc = doc.media as unknown as Media;
  return {
    id: mediaDoc.xid,
    mimeType: mediaDoc.mimeType,
    sizeBytes: mediaDoc.sizeBytes,
    durationMs: mediaDoc.durationMs,
    audioUrl,
  };
}
