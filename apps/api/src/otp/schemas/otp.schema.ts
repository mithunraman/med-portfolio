import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'otps',
  timestamps: true,
})
export class Otp {
  _id!: Types.ObjectId;

  // No standalone index — every query filters by email and is served by the
  // { email, createdAt: -1 } compound below, whose leading prefix is email.
  @Prop({ required: true })
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

/**
 * Retain OTP rows at least as long as the rate-limit window so per-email
 * send-volume counts (countRecentByEmail) are accurate. Sized to cover the max
 * configurable window (OTP_RATE_LIMIT_WINDOW_MINUTES, capped at 60m) so a static
 * index stays correct for any runtime value. Code *validity* is enforced
 * separately via the expiresAt check in OtpService.verifyOtp — lingering expired
 * rows are never verifiable.
 */
export const OTP_RETENTION_SECONDS = 60 * 60; // 60m

export const OtpSchema = SchemaFactory.createForClass(Otp);

// TTL keyed on createdAt (not expiresAt) so rows survive the full rate-limit
// window; MongoDB reaps them OTP_RETENTION_SECONDS after creation.
OtpSchema.index({ createdAt: 1 }, { expireAfterSeconds: OTP_RETENTION_SECONDS });

// Rate-limit count + latest-code lookup (both filter by email, order by createdAt).
OtpSchema.index({ email: 1, createdAt: -1 });
