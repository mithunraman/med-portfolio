import { AudienceType, NoticeSeverity, NoticeType, UserRole } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';

@Schema({
  collection: 'notices',
  timestamps: true,
})
export class Notice {
  _id!: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, type: String, enum: Object.values(NoticeType) })
  type!: NoticeType;

  @Prop({ required: true, type: String, enum: Object.values(NoticeSeverity) })
  severity!: NoticeSeverity;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, default: null })
  body!: string | null;

  @Prop({ type: String, default: null })
  actionUrl!: string | null;

  @Prop({ type: String, default: null })
  actionLabel!: string | null;

  @Prop({ required: true, default: true })
  dismissible!: boolean;

  @Prop({ required: true, type: Date })
  startsAt!: Date;

  @Prop({ type: Date, default: null })
  expiresAt!: Date | null;

  @Prop({ required: true, default: true })
  active!: boolean;

  @Prop({ required: true, type: String, enum: Object.values(AudienceType) })
  audienceType!: AudienceType;

  @Prop({ type: [Number], default: undefined })
  audienceRoles?: UserRole[];

  @Prop({ type: [String], default: undefined })
  audienceUserIds?: string[];

  @Prop({ required: true, default: 0 })
  priority!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export type NoticeDocument = Notice & Document;

export const NoticeSchema = SchemaFactory.createForClass(Notice);

NoticeSchema.index({ active: 1, startsAt: 1, expiresAt: 1 });
