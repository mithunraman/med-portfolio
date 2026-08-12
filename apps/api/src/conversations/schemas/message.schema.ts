import { type Question, MessageStatus, MessageRole, MessageType } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { Media } from '../../media/schemas/media.schema';
import { Conversation } from './conversation.schema';

/**
 * Transcription metadata from AssemblyAI
 */
export class TranscriptionMetadata {
  @Prop({ type: Number, default: null })
  confidence!: number | null;

  @Prop({ type: Number, default: null })
  audioDurationMs!: number | null;

  @Prop({ type: Number, default: null })
  wordCount!: number | null;
}

@Schema({
  collection: 'messages',
  timestamps: true,
})
export class Message {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  // No standalone index: conversation queries are served by the { conversation: 1, _id: -1 } compound prefix.
  @Prop({ required: true, type: Types.ObjectId, ref: Conversation.name })
  conversation!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: Number })
  role!: MessageRole;

  @Prop({ required: true, type: Number })
  messageType!: MessageType;

  // Content stages
  @Prop({ type: String, default: null })
  rawContent!: string | null; // Original text input OR raw transcript from audio

  @Prop({ type: String, default: null })
  redactedContent!: string | null; // PII-redacted text (send-path: pre-cleaning intermediate; final text is in `content`)

  @Prop({ type: String, default: null })
  content!: string | null; // Final processed content (displayed to user)

  // Media attachment
  @Prop({ type: Types.ObjectId, ref: Media.name, default: null })
  media!: Types.ObjectId | null;

  // Processing status
  @Prop({ required: true, type: Number, default: MessageStatus.PENDING })
  status!: MessageStatus;

  @Prop({ type: String, default: null })
  processingError!: string | null;

  // Embedded question for structured Q&A (always-together reads)
  @Prop({ type: Object, default: null })
  question!: Question | null;

  // Answer stored after user responds to a question (single_select / multi_select)
  @Prop({ type: Object, default: null })
  answer!: Record<string, unknown> | null;

  // Transcription metadata (populated after audio transcription)
  @Prop({ type: TranscriptionMetadata, default: null })
  transcription!: TranscriptionMetadata | null;

  // Idempotency key for deduplication (unique per user).
  // Must be set by the caller — auto-generated at the service/graph layer.
  @Prop({ required: true, type: String })
  idempotencyKey!: string;

  // True for system-authored audit messages (e.g. a recorded option selection).
  // Such messages are not user-editable/deletable even though role is USER.
  @Prop({ required: true, type: Boolean, default: false })
  generated!: boolean;

  // Timestamp of the last in-place user edit; null if never edited.
  @Prop({ type: Date, default: null })
  editedAt!: Date | null;

  /**
   * Retention anchor: when `rawContent` was last written. Drives the 48-hour
   * scrub (C-2), and its absence is the mapper's "raw copy removed" signal.
   *
   * Schema default so creation can never forget it. A future write path that
   * sets `rawContent` without bumping this leaves the anchor OLDER, so the
   * message is swept sooner rather than never — the control fails closed.
   *
   * Deliberately NOT `editedAt`: that field's null-ness drives the mobile
   * "Edited" label (BubbleShell.tsx), so stamping it at creation would mark
   * every message in the app as edited.
   */
  @Prop({ type: Date, default: () => new Date() })
  rawContentWrittenAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type MessageDocument = Message & Document;

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes for cursor-based pagination (sort by _id descending)
MessageSchema.index({ conversation: 1, _id: -1 });

// Compound unique index for idempotency: userId + idempotencyKey.
MessageSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });

// Retention sweep hot path (C-2). The SORT field is the anchor; the INCLUSION
// predicate is `rawContent`. Those are independent, and the combination is what
// makes this work: the index holds only documents that still carry raw content —
// roughly 48h of messages in steady state, not the whole collection — and a
// scrubbed document leaves it automatically. A plain { rawContentWrittenAt: 1 }
// index would instead have the sweep scan a range covering nearly every message
// ever sent, growing without bound.
MessageSchema.index(
  { rawContentWrittenAt: 1 },
  { partialFilterExpression: { rawContent: { $type: 'string' } } }
);
