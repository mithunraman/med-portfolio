import { OutboxStatus } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

@Schema({
  collection: 'outbox',
  timestamps: true,
})
export class OutboxEntry {
  _id!: Types.ObjectId;
  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ required: true, type: SchemaTypes.Mixed })
  payload!: Record<string, unknown>;

  @Prop({ required: true, type: Number, default: OutboxStatus.PENDING })
  status!: OutboxStatus;

  @Prop({ required: true, type: Number, default: 0 })
  attempts!: number;

  @Prop({ required: true, type: Number, default: 3 })
  maxAttempts!: number;

  @Prop({ type: String, default: null })
  lastError!: string | null;

  @Prop({ required: true, type: Date, default: () => new Date() })
  processAfter!: Date;

  @Prop({ type: Date, default: null })
  lockedUntil!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type OutboxEntryDocument = OutboxEntry & Document;

export const OutboxEntrySchema = SchemaFactory.createForClass(OutboxEntry);

// Consumer query: find pending jobs ready to process
OutboxEntrySchema.index({ status: 1, processAfter: 1 });

// Filter by job type
OutboxEntrySchema.index({ type: 1, status: 1 });
