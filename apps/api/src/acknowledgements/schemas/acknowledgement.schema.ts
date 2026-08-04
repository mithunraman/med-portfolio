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

/**
 * The evidential record that a user was shown a notice version and accepted it.
 * Rows outlive account deletion deliberately (Art 17(3)(e)) — which is exactly
 * why they must carry no identifiers of their own. `userId` here points at a
 * user record that account cleanup has already stripped to an ObjectId, so the
 * row is anonymous; storing an IP or user-agent would undo that.
 *
 * Nothing is lost evidentially: the row was written by an authenticated
 * request, `noticeVersion` resolves to a frozen notice document, and together
 * those answer who, when, and what they were shown. An IP identifies a shared
 * mobile network path, not a person.
 */
@Schema({
  collection: 'acknowledgements',
  timestamps: { createdAt: 'recordedAt', updatedAt: false },
})
export class Acknowledgement {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, type: Types.ObjectId })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  noticeVersion!: string;

  @Prop({ required: true, type: [AcknowledgementEntrySchema], default: [] })
  acknowledgements!: AcknowledgementEntry[];

  recordedAt!: Date;
}

export type AcknowledgementDocument = Acknowledgement & Document;

export const AcknowledgementSchema = SchemaFactory.createForClass(Acknowledgement);

// Idempotency: one row per (user, version).
AcknowledgementSchema.index({ userId: 1, noticeVersion: 1 }, { unique: true });

// `findAcknowledgedVersions` does `distinct('noticeVersion', { userId })`,
// which is covered by the unique `{ userId: 1, noticeVersion: 1 }` index above.
