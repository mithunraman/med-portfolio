import { MediaRefCollection, MediaStatus, MediaType } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'media',
  timestamps: true,
})
export class Media {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, type: String })
  xid!: string;

  // No standalone index: userId queries are served by the { userId: 1, status: 1 } compound prefix.
  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  // S3 location
  @Prop({ required: true })
  bucket!: string;

  @Prop({ required: true })
  key!: string;

  // Status
  @Prop({ required: true, type: Number, default: MediaStatus.PENDING })
  status!: MediaStatus;

  // Reference (where is this media attached?)
  @Prop({ type: Number, default: null })
  refCollection!: MediaRefCollection | null;

  @Prop({ type: Types.ObjectId, default: null })
  refDocumentId!: Types.ObjectId | null;

  // Metadata
  @Prop({ required: true, type: Number })
  mediaType!: MediaType;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ type: Number, default: null })
  sizeBytes!: number | null;

  @Prop({ type: Number, default: null })
  durationMs!: number | null;

  // Deletion lifecycle
  @Prop({ type: Date, default: null })
  pendingDeleteAt!: Date | null;

  @Prop({ required: true, type: Number, default: 0 })
  deleteAttempts!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type MediaDocument = Media & Document;

export const MediaSchema = SchemaFactory.createForClass(Media);

// Indexes
MediaSchema.index({ userId: 1, status: 1 });
// Sweeper hot path: findPendingDeleteBatch seeks PENDING_DELETE rows below the
// dead-letter threshold; countDeadLettered counts those at/above it. Bounding
// deleteAttempts in the index (not as a residual filter) stops every poll from
// re-scanning the permanent dead-letter backlog. Its { status: 1 } prefix also
// serves any status-only scan, so no separate single-field status index is needed.
MediaSchema.index({ status: 1, deleteAttempts: 1 });
// Cascade hot path: markPendingDeleteByMessageIds filters
// { refDocumentId: { $in }, refCollection, status }. refDocumentId leads
// (most selective); refCollection + status served from the index.
MediaSchema.index({ refDocumentId: 1, refCollection: 1, status: 1 });
