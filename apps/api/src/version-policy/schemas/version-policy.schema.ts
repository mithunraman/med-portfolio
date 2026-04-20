import { Platform } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  collection: 'version_policies',
  timestamps: true,
})
export class VersionPolicy {
  _id!: Types.ObjectId;
  @Prop({ required: true, unique: true, type: String, enum: Object.values(Platform) })
  platform!: Platform;

  @Prop({ required: true })
  minimumVersion!: string;

  @Prop({ required: true })
  recommendedVersion!: string;

  @Prop({ required: true })
  latestVersion!: string;

  @Prop({ required: true })
  storeUrl!: string;

  @Prop({ type: String, default: null })
  message!: string | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type VersionPolicyDocument = VersionPolicy & Document;

export const VersionPolicySchema = SchemaFactory.createForClass(VersionPolicy);
