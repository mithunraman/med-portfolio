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

  @Prop({ required: true, unique: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  // No standalone index: userId queries are served by the { userId: 1, status: 1 } compound prefix.
  @Prop({ required: true, type: Types.ObjectId })
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
