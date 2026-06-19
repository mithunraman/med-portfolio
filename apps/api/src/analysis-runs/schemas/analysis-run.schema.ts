import { AnalysisRunStatus } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { Conversation } from '../../conversations/schemas/conversation.schema';
import type { RefineTrace, ReflectTrace } from '../../portfolio-graph/portfolio-graph.state';

export class SnapshotRange {
  @Prop({ type: Types.ObjectId, default: null })
  fromMessageId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  toMessageId!: Types.ObjectId | null;
}

export class CurrentQuestion {
  @Prop({ required: true, type: Types.ObjectId })
  messageId!: Types.ObjectId;

  @Prop({ required: true, type: String })
  node!: string;

  @Prop({ required: true, type: String })
  questionType!: 'single_select' | 'multi_select' | 'free_text' | 'terminal';
}

export class AnalysisRunError {
  @Prop({ required: true, type: String })
  code!: string;

  @Prop({ required: true, type: String })
  message!: string;
}

@Schema({
  collection: 'analysis_runs',
  timestamps: true,
})
export class AnalysisRun {
  _id!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: Conversation.name })
  conversationId!: Types.ObjectId;

  @Prop({ required: true, type: Number })
  runNumber!: number;

  @Prop({ required: true, type: Number, default: AnalysisRunStatus.PENDING })
  status!: AnalysisRunStatus;

  @Prop({ type: SnapshotRange, default: () => ({ fromMessageId: null, toMessageId: null }) })
  snapshotRange!: SnapshotRange;

  @Prop({ type: CurrentQuestion, default: null })
  currentQuestion!: CurrentQuestion | null;

  @Prop({ type: Types.ObjectId, ref: 'Artefact', default: null })
  artefactId!: Types.ObjectId | null;

  @Prop({ required: true, type: String })
  idempotencyKey!: string;

  @Prop({ required: true, type: String })
  langGraphThreadId!: string;

  @Prop({ type: String, default: null })
  currentStep!: string | null;

  @Prop({ type: AnalysisRunError, default: null })
  error!: AnalysisRunError | null;

  // Immutable debug/eval trace of the reflect step (per-section probe extraction,
  // synthesised narrative, verification verdict, shipped text). Server-only —
  // never projected to a client DTO. Cleared by the tombstone payload on delete
  // since it embeds trainee clinical content. Stored as Mixed: it is read by
  // developers, never queried by shape.
  @Prop({ type: [Object], default: null })
  reflectTrace!: ReflectTrace | null;

  // Immutable debug/eval trace of the refine step (per-section before/after text,
  // meaning-preservation verdict, shipped source). Same treatment as
  // `reflectTrace`: server-only, never projected to a client DTO, cleared by the
  // delete tombstone since it embeds trainee clinical content. Stored as Mixed.
  @Prop({ type: [Object], default: null })
  refineTrace!: RefineTrace | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AnalysisRunDocument = AnalysisRun & Document;

export const AnalysisRunSchema = SchemaFactory.createForClass(AnalysisRun);

// Find active run for a conversation
AnalysisRunSchema.index({ conversationId: 1, status: 1, createdAt: -1 });

// Idempotent trigger — compound unique per conversation
AnalysisRunSchema.index({ conversationId: 1, idempotencyKey: 1 }, { unique: true });

// Unique run number per conversation
AnalysisRunSchema.index({ conversationId: 1, runNumber: 1 }, { unique: true });

// At most one active (non-terminal) run per conversation — prevents race condition
// where concurrent requests both pass the application-level findActiveRun() check.
AnalysisRunSchema.index(
  { conversationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: [AnalysisRunStatus.PENDING, AnalysisRunStatus.RUNNING, AnalysisRunStatus.AWAITING_INPUT],
      },
    },
  },
);

// Cascade resolver: markDeletedByArtefactIds filters on
// { artefactId: { $in }, status: { $ne: DELETED } }. artefactId leads
// (selective); status is in the index for read patterns that filter by
// exact status. `$ne` itself can't use index bounds, so the second key
// doesn't accelerate the cascade — it earns its keep on exact-status reads.
AnalysisRunSchema.index({ artefactId: 1, status: 1 });
