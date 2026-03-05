import { AnalysisRunStatus } from '@acme/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { Conversation } from '../../conversations/schemas/conversation.schema';

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

  @Prop({ required: true, type: Types.ObjectId, ref: Conversation.name, index: true })
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

  @Prop({ type: AnalysisRunError, default: null })
  error!: AnalysisRunError | null;

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
