import type { AcknowledgementId } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';

@Schema({ _id: false })
export class AcknowledgementEntry {
  @Prop({ required: true, type: String })
  id!: AcknowledgementId;

  @Prop({ required: true, type: Boolean })
  given!: boolean;
}

export const AcknowledgementEntrySchema = SchemaFactory.createForClass(AcknowledgementEntry);

@Schema({
  collection: 'acknowledgements',
  timestamps: { createdAt: 'recordedAt', updatedAt: false },
})
export class Acknowledgement {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  noticeVersion!: string;

  @Prop({ required: true, type: [AcknowledgementEntrySchema], default: [] })
  acknowledgements!: AcknowledgementEntry[];

  @Prop({ type: String, default: null })
  ip!: string | null;

  @Prop({ type: String, default: null })
  userAgent!: string | null;

  recordedAt!: Date;
}

export type AcknowledgementDocument = Acknowledgement & Document;

export const AcknowledgementSchema = SchemaFactory.createForClass(Acknowledgement);

// Idempotency: one row per (user, version).
AcknowledgementSchema.index({ userId: 1, noticeVersion: 1 }, { unique: true });

// `findAcknowledgedVersions` does `distinct('noticeVersion', { userId })`,
// which is covered by the unique `{ userId: 1, noticeVersion: 1 }` index above.
