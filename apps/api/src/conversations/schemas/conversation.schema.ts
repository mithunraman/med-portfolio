import { ConversationStatus } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoid } from 'nanoid';

@Schema({
  collection: 'conversations',
  timestamps: true,
})
export class Conversation {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, default: () => nanoid() })
  xid!: string;

  @Prop({ required: true, unique: true, index: true })
  conversationId!: string; // Format: {userId}_{clientId}

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true, type: Number, default: ConversationStatus.ACTIVE })
  status!: ConversationStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ConversationDocument = Conversation & Document;

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Indexes for cursor-based pagination (sort by _id descending)
ConversationSchema.index({ userId: 1, _id: -1 });
ConversationSchema.index({ conversationId: 1 }, { unique: true });
