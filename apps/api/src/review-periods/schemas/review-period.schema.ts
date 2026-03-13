import { ReviewPeriodStatus } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';

@Schema({
  collection: 'review_periods',
  timestamps: true,
})
export class ReviewPeriod {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: String, maxlength: 100 })
  name!: string;

  @Prop({ required: true, type: Date })
  startDate!: Date;

  @Prop({ required: true, type: Date })
  endDate!: Date;

  @Prop({ required: true, type: Number, default: ReviewPeriodStatus.ACTIVE })
  status!: ReviewPeriodStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ReviewPeriodDocument = ReviewPeriod & Document;

export const ReviewPeriodSchema = SchemaFactory.createForClass(ReviewPeriod);

// Indexes
ReviewPeriodSchema.index({ userId: 1, status: 1 });
