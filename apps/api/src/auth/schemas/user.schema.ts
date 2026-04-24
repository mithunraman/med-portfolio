import { Specialty, UserRole } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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

  @Prop({ required: true, type: Number, default: UserRole.USER })
  role!: UserRole;

  @Prop({ type: Number, default: null })
  specialty!: Specialty | null;

  @Prop({ type: String, default: null })
  trainingStage!: string | null;

  @Prop({ type: Date, default: null })
  deletionRequestedAt!: Date | null;

  @Prop({ type: Date, default: null })
  deletionScheduledFor!: Date | null;

  @Prop({ type: Date, default: null })
  anonymizedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = User & Document;

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes (email unique index is created by @Prop({ unique: true, index: true }))
UserSchema.index({ deletionScheduledFor: 1 }, { sparse: true });
