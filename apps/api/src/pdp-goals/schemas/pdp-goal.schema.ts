import { PdpGoalStatus } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Embedded action subdocument
export class PdpGoalAction {
  @Prop({ required: true })
  xid!: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true, default: '' })
  intendedEvidence!: string;

  @Prop({ required: true, type: Number, default: PdpGoalStatus.NOT_STARTED })
  status!: PdpGoalStatus;

  @Prop({ type: Date, default: null })
  dueDate!: Date | null;

  @Prop({ type: String, default: null })
  completionReview!: string | null;
}

@Schema({
  collection: 'pdp_goals',
  timestamps: true,
})
export class PdpGoal {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  xid!: string;

  @Prop({ required: true })
  goal!: string;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null })
  artefactId!: Types.ObjectId | null;

  @Prop({ required: true, type: Number, default: PdpGoalStatus.NOT_STARTED })
  status!: PdpGoalStatus;

  @Prop({ type: Date, default: null })
  reviewDate!: Date | null;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: String, default: null })
  completionReview!: string | null;

  @Prop({ type: [PdpGoalAction], default: [] })
  actions!: PdpGoalAction[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type PdpGoalDocument = PdpGoal & Document;

export const PdpGoalSchema = SchemaFactory.createForClass(PdpGoal);

// Compound indexes
PdpGoalSchema.index({ userId: 1, status: 1, reviewDate: 1 });
PdpGoalSchema.index({ artefactId: 1 });
