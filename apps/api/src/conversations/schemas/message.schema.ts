import { type MessageMetadata, MessageProcessingStatus, MessageRole, MessageType } from '@acme/shared';
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

  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: Conversation.name, index: true })
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
  cleanedContent!: string | null; // After cleaning stage

  @Prop({ type: String, default: null })
  content!: string | null; // Final processed content (displayed to user)

  // Media attachment
  @Prop({ type: Types.ObjectId, ref: Media.name, default: null })
  media!: Types.ObjectId | null;

  // Processing status
  @Prop({ required: true, type: Number, default: MessageProcessingStatus.PENDING })
  processingStatus!: MessageProcessingStatus;

  @Prop({ type: String, default: null })
  processingError!: string | null;

  // Structured metadata for special message types (e.g. classification options)
  @Prop({ type: Object, default: null })
  metadata!: MessageMetadata | null;

  // Transcription metadata (populated after audio transcription)
  @Prop({ type: TranscriptionMetadata, default: null })
  transcription!: TranscriptionMetadata | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type MessageDocument = Message & Document;

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes for cursor-based pagination (sort by _id descending)
MessageSchema.index({ conversation: 1, _id: -1 });
