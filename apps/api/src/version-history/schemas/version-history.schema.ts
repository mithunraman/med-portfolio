import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';

@Schema({
  collection: 'version_history',
  timestamps: true,
})
export class VersionHistory {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true })
  entityType!: string;

  @Prop({ required: true, type: Types.ObjectId })
  entityId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  version!: number;

  @Prop({ required: true })
  timestamp!: Date;

  @Prop({ type: Object, required: true })
  snapshot!: Record<string, unknown>;

  createdAt!: Date;
  updatedAt!: Date;
}

export type VersionHistoryDocument = VersionHistory & Document;

export const VersionHistorySchema = SchemaFactory.createForClass(VersionHistory);

VersionHistorySchema.index({ entityType: 1, entityId: 1, version: -1 });
