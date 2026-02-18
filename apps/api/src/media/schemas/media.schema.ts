import { MediaRefCollection, MediaStatus, MediaType } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'media',
  timestamps: true,
})
export class Media {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, type: String })
  xid!: string;

  @Prop({ required: true, type: Types.ObjectId, index: true })
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

  createdAt!: Date;
  updatedAt!: Date;
}

export type MediaDocument = Media & Document;

export const MediaSchema = SchemaFactory.createForClass(Media);

// Indexes
MediaSchema.index({ userId: 1, status: 1 });
