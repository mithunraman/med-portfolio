import { ConversationStatus } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';

@Schema({
  collection: 'conversations',
  timestamps: true,
})
export class Conversation {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  // No standalone index: userId queries are served by the { userId: 1, _id: -1 } compound prefix.
  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  // No standalone index: artefact queries are served by the { artefact: 1, status: 1 } compound prefix.
  @Prop({ required: true, type: Types.ObjectId, ref: 'Artefact' })
  artefact!: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true, type: Number, default: ConversationStatus.ACTIVE })
  status!: ConversationStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ConversationDocument = Conversation & Document;

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes
ConversationSchema.index({ userId: 1, _id: -1 });
ConversationSchema.index({ artefact: 1, status: 1 });
