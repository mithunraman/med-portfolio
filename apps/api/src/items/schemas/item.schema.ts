import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ItemStatus } from '@acme/shared';

@Schema({
  collection: 'items',
  timestamps: true,
})
export class Item {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 100 })
  name!: string;

  @Prop({ maxlength: 500 })
  description?: string;

  @Prop({ required: true, type: Number, default: ItemStatus.DRAFT })
  status!: ItemStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ItemDocument = Item & Document;

export const ItemSchema = SchemaFactory.createForClass(Item);

// Indexes
ItemSchema.index({ userId: 1, status: 1 });
ItemSchema.index({ userId: 1, createdAt: -1 });
