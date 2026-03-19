import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'otps',
  timestamps: true,
})
export class Otp {
  _id!: Types.ObjectId;

  @Prop({ required: true, index: true })
  email!: string;

  @Prop({ required: true })
  codeHash!: string;

  @Prop({ type: Number, default: 0 })
  attempts!: number;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export type OtpDocument = Otp & Document;

export const OtpSchema = SchemaFactory.createForClass(Otp);

// TTL index: MongoDB auto-deletes documents when expiresAt is in the past
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for rate limiting queries: find recent OTPs by email
OtpSchema.index({ email: 1, createdAt: -1 });
