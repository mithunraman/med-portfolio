import { AnalysisRunStatus, NON_TERMINAL_RUN_STATUSES } from '@acme/shared';
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

  @Prop({ required: true, unique: true, default: () => nanoidAlphanumeric() })
  xid!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: Conversation.name })
  conversationId!: Types.ObjectId;

  // Denormalised from the parent conversation so the ownership predicate can be
  // enforced in the filter rather than assumed from the caller. Written once by
  // `createRun`; no update path touches it.
  //
  // No standalone index: `userId` is never the selective key. Every owner-scoped
  // query leads with `_id`, `conversationId` or `artefactId` — all indexed — so
  // `userId` only ever narrows an already-bounded set.
  //
  // Stated as a rule rather than an inventory on purpose: if a query is ever
  // added that filters by `userId` alone, that is the point to revisit this and
  // justify an index, rather than assuming this note still covers it.
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

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

  // Set once the sweeper has hard-deleted this run's LangGraph checkpoint data.
  //
  // Explicitly defaulted to null rather than left absent: the sweeper's partial
  // index below selects unpurged rows, and MongoDB rejects `$exists: false` in a
  // partialFilterExpression (it is a `$not` internally). Equality against null is
  // supported, so the field has to be present to be matched that way.
  //
  // Not bookkeeping: the purge predicate lives here while the data lives in
  // another collection, so without a marker every tick would re-issue deleteMany
  // for every terminal run that ever existed, growing with lifetime volume
  // instead of with work to do. It is also the audit record that checkpoint
  // retention was actually enforced.
  @Prop({ type: Date, default: null })
  checkpointsPurgedAt!: Date | null;

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
//
// The status list MUST stay identical to the one findActiveRun uses, or the guard
// rejects starts this index would have permitted. Both now read the same shared
// set rather than restating the members, so they cannot drift.
AnalysisRunSchema.index(
  { conversationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [...NON_TERMINAL_RUN_STATUSES] },
    },
  },
);

// Cascade resolver: markDeletedByArtefactIds filters on
// { artefactId: { $in }, status: { $ne: DELETED } }. artefactId leads
// (selective); status is in the index for read patterns that filter by
// exact status. `$ne` itself can't use index bounds, so the second key
// doesn't accelerate the cascade — it earns its keep on exact-status reads.
AnalysisRunSchema.index({ artefactId: 1, status: 1 });

// Checkpoint sweeper: both phases filter by status and an `updatedAt` cutoff.
//
// The partial filter is what makes the hourly tick free rather than merely
// cheap: in steady state almost every run has been purged, so the index holds
// only the work outstanding and shrinks back to near-empty after each sweep.
// It also, incidentally, serves phase 1 — a non-terminal run is never purged, so
// it is never marked, so it is always in this index.
//
// Equality against null, NOT `$exists: false`: MongoDB rejects the latter in a
// partialFilterExpression because it desugars to `$not`. The index would simply
// fail to build, leaving the sweeper on a collection scan with nothing failing
// loudly. `checkpointsPurgedAt` therefore defaults to null so it is always
// present to match.
AnalysisRunSchema.index(
  { status: 1, updatedAt: 1 },
  { partialFilterExpression: { checkpointsPurgedAt: null } }
);
