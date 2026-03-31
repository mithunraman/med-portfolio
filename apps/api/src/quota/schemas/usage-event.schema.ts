import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'usage_events', timestamps: true })
export class UsageEvent {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata!: Record<string, unknown> | null;

  createdAt!: Date;
}

export type UsageEventDocument = UsageEvent & Document;

export const UsageEventSchema = SchemaFactory.createForClass(UsageEvent);

// Primary query: count by user within time range
UsageEventSchema.index({ userId: 1, createdAt: -1 });

// Auto-delete events older than 90 days
UsageEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
