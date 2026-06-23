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

  // The trainee's descriptor-linked justification (their own words). '' until elicited.
  @Prop({ type: String, default: '' })
  justification!: string;
}

// A rendered output document field the trainee submits (e.g. "Brief Description").
export class ComposedSection {
  @Prop({ required: true })
  sectionId!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  text!: string;
}

// A required section left unmet when analysis finished, with why it is unmet
// (`missing` = no content, `shallow` = too thin) and a display label.
export class UnmetSection {
  @Prop({ required: true })
  sectionId!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true, type: String, enum: ['missing', 'shallow'] })
  status!: 'missing' | 'shallow';
}

export class Completeness {
  @Prop({ required: true, type: Boolean })
  complete!: boolean;

  @Prop({ type: [UnmetSection], default: [] })
  unmetSections!: UnmetSection[];
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

// A freeform note the author attaches to an artefact after creation. The
// server-minted xid is the stable per-note identity — the array is replaced
// wholesale on save, so the xid is how an existing note keeps its createdAt.
// Independent of the AI pipeline and version history.
export class Note {
  @Prop({ required: true })
  xid!: string;

  @Prop({ required: true })
  text!: string;

  @Prop({ required: true, type: Date })
  createdAt!: Date;

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

  @Prop({ type: [Capability], default: null })
  capabilities!: Capability[] | null;

  // Which required sections were left unmet when analysis finished — drives a soft
  // "needs your input" nudge. null until the analysis graph completes.
  @Prop({ type: Completeness, default: null, _id: false })
  completeness!: Completeness | null;

  // Graded readiness outputs (coexist with `completeness`). null until analysis completes.
  @Prop({ type: String, enum: ['in_progress', 'ready', 'needs_attention'], default: null })
  draftStatus!: 'in_progress' | 'ready' | 'needs_attention' | null;

  @Prop({ type: Number, default: null })
  readinessScore!: number | null;

  // The rendered document fields the trainee submits (e.g. "Brief Description").
  // The single source of truth for the entry body — shown, edited, versioned.
  @Prop({ type: [ComposedSection], default: null, _id: false })
  composedDocument!: ComposedSection[] | null;

  @Prop({ type: Object, default: null })
  tags!: Record<string, string[]> | null;

  // null until the author rates; never touched by the LLM pipeline or version snapshots.
  @Prop({ type: ArtefactReview, default: null, _id: false })
  review!: ArtefactReview | null;

  // Freeform author notes, managed via PUT :id/notes (array-replace). Defaults to
  // [] (not null) — user-authored, with no "pipeline hasn't run" state to signal.
  // Excluded from version snapshots, like `review`.
  @Prop({ type: [Note], default: [], _id: false })
  notes!: Note[];

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
