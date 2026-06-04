import {
  ARTEFACT_RATING_MAX,
  ARTEFACT_RATING_MIN,
  ARTEFACT_REVIEW_COMMENT_MAX_LENGTH,
  ArtefactStatus,
  Specialty,
} from '@acme/shared';
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

// Author's private review of the AI output. One per artefact, edit-only.
// Embedded (not a separate collection) because it is 1:1, read on every
// artefact-detail load, and must die with the artefact on delete.
export class ArtefactReview {
  @Prop({ required: true, type: Number, min: ARTEFACT_RATING_MIN, max: ARTEFACT_RATING_MAX })
  rating!: number;

  @Prop({ type: String, maxlength: ARTEFACT_REVIEW_COMMENT_MAX_LENGTH, default: null })
  comment!: string | null;

  @Prop({ required: true, type: Date })
  updatedAt!: Date;
}

@Schema({
  collection: 'artefacts',
  timestamps: true,
})
export class Artefact {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, unique: true })
  artefactId!: string; // Format: {userId}_{clientGeneratedId}

  @Prop({ required: true, type: Types.ObjectId, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: Number, default: Specialty.GP })
  specialty!: Specialty;

  @Prop({ required: true, type: String, default: '' })
  trainingStage!: string;

  @Prop({ required: true, type: Number, default: ArtefactStatus.IN_CONVERSATION })
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

  // null until the author rates; never touched by the LLM pipeline or version snapshots.
  @Prop({ type: ArtefactReview, default: null, _id: false })
  review!: ArtefactReview | null;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type ArtefactDocument = Artefact & Document;

export const ArtefactSchema = SchemaFactory.createForClass(Artefact);

// Indexes (artefactId unique index is created by @Prop({ unique: true }))
ArtefactSchema.index({ userId: 1, status: 1 });
ArtefactSchema.index({ userId: 1, createdAt: -1 });
ArtefactSchema.index({ userId: 1, status: 1, completedAt: 1 });
