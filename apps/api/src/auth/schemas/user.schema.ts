import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { UserRole } from '@acme/shared';

@Schema({
  collection: 'users',
  timestamps: true,
})
export class User {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, type: Number, default: UserRole.USER })
  role!: UserRole;

  @Prop({ type: Number, default: 0 })
  failedLoginAttempts!: number;

  @Prop({ type: Date, default: null })
  lockedUntil!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = User & Document;

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ email: 1 }, { unique: true });
