import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'notice_dismissals',
  timestamps: false,
})
export class NoticeDismissal {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  noticeId!: Types.ObjectId;

  @Prop({ required: true, type: Date, default: () => new Date() })
  dismissedAt!: Date;
}

export type NoticeDismissalDocument = NoticeDismissal & Document;

export const NoticeDismissalSchema = SchemaFactory.createForClass(NoticeDismissal);

NoticeDismissalSchema.index({ userId: 1, noticeId: 1 }, { unique: true });
