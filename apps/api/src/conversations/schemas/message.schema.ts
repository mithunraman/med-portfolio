import { MessageRole } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Conversation } from './conversation.schema';

@Schema({
  collection: 'messages',
  timestamps: true,
})
export class Message {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: Conversation.name, index: true })
  conversation!: Types.ObjectId;

  @Prop({ required: true, type: Number })
  role!: MessageRole;

  @Prop({ required: true })
  content!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type MessageDocument = Message & Document;

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes for cursor-based pagination (sort by _id descending)
MessageSchema.index({ conversation: 1, _id: -1 });
