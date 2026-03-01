import { ArtefactStatus, Specialty } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';

// Embedded schemas
export class Capability {
  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  evidence!: string;
}

export class ReflectionSection {
  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  text!: string;
}

@Schema({
  collection: 'artefacts',
  timestamps: true,
})
export class Artefact {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, unique: true, index: true })
  artefactId!: string; // Format: {userId}_{clientGeneratedId}

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: Number, default: Specialty.GP })
  specialty!: Specialty;

  @Prop({ required: true, type: Number, default: ArtefactStatus.DRAFT })
  status!: ArtefactStatus;

  @Prop({ type: String, default: null })
  artefactType!: string | null;

  @Prop({ type: String, maxlength: 200, default: null })
  title!: string | null;

  @Prop({ type: [ReflectionSection], default: null })
  reflection!: ReflectionSection[] | null;

  @Prop({ type: [Capability], default: null })
  capabilities!: Capability[] | null;

  @Prop({ type: Object, default: null })
  tags!: Record<string, string[]> | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ArtefactDocument = Artefact & Document;

export const ArtefactSchema = SchemaFactory.createForClass(Artefact);

// Indexes
ArtefactSchema.index({ artefactId: 1 }, { unique: true });
ArtefactSchema.index({ userId: 1, status: 1 });
ArtefactSchema.index({ userId: 1, createdAt: -1 });
