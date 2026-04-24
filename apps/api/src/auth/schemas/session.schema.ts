import { SessionRevokedReason } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'sessions',
  timestamps: true,
})
export class Session {
  _id!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  deviceId!: string;

  @Prop({ required: true })
  deviceName!: string;

  @Prop({ required: true, unique: true, index: true })
  refreshTokenHash!: string;

  @Prop({ required: true, index: true })
  refreshTokenFamily!: string;

  @Prop({ type: [String], default: [] })
  previousHashes!: string[];

  @Prop({ type: Date, default: () => new Date() })
  lastUsedAt!: Date;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: String, enum: Object.values(SessionRevokedReason), default: null })
  revokedReason!: SessionRevokedReason | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type SessionDocument = Session & Document;

export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ userId: 1, deviceId: 1, revokedAt: 1 });
SessionSchema.index({ refreshTokenFamily: 1, revokedAt: 1 });
