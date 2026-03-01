import { PdpActionStatus } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';

@Schema({
  collection: 'pdp_actions',
  timestamps: true,
})
export class PdpAction {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  artefactId!: Types.ObjectId;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  timeframe!: string;

  @Prop({ required: true, type: Number, default: PdpActionStatus.PENDING })
  status!: PdpActionStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PdpActionDocument = PdpAction & Document;

export const PdpActionSchema = SchemaFactory.createForClass(PdpAction);

// Compound indexes
PdpActionSchema.index({ artefactId: 1, status: 1 });
PdpActionSchema.index({ userId: 1, status: 1 });
