import { AnalysisRunStatus } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { Result } from '../common/utils/result.util';
import type { AnalysisRun } from './schemas/analysis-run.schema';

export const ANALYSIS_RUNS_REPOSITORY = Symbol('ANALYSIS_RUNS_REPOSITORY');

export interface DBError {
  code: string;
  message: string;
}

export interface CreateAnalysisRunData {
  conversationId: Types.ObjectId;
  runNumber: number;
  idempotencyKey: string;
  langGraphThreadId: string;
  snapshotRange?: {
    fromMessageId: Types.ObjectId | null;
    toMessageId: Types.ObjectId | null;
  };
}

export interface UpdateAnalysisRunData {
  status?: AnalysisRunStatus;
  snapshotRange?: {
    fromMessageId: Types.ObjectId | null;
    toMessageId: Types.ObjectId | null;
  };
  currentQuestion?: { messageId: Types.ObjectId; node: string; questionType: string } | null;
  artefactId?: Types.ObjectId | null;
  currentStep?: string | null;
  error?: { code: string; message: string } | null;
}

export interface IAnalysisRunsRepository {
  createRun(
    data: CreateAnalysisRunData,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun, DBError>>;

  findRunByXid(
    xid: string,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  findRunById(
    runId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Find an existing run by conversation + idempotency key.
   * Used to implement idempotent triggers.
   */
  findRunByIdempotencyKey(
    conversationId: Types.ObjectId,
    idempotencyKey: string,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Find the active (non-terminal) run for a conversation.
   * Terminal statuses: COMPLETED, FAILED.
   */
  findActiveRun(
    conversationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Find the most recent run for a conversation, regardless of status.
   * Used by ConversationContextService to derive conversation phase.
   */
  findLatestRun(
    conversationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Atomically transition a run's status using optimistic locking.
   * Returns null if the run doesn't exist or expectedStatus doesn't match.
   */
  updateRunStatus(
    runId: Types.ObjectId,
    expectedStatus: AnalysisRunStatus,
    updates: UpdateAnalysisRunData,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Get the highest run number for a conversation.
   * Returns 0 if no runs exist.
   */
  getMaxRunNumber(
    conversationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<number, DBError>>;

  /**
   * Update currentStep on the active (non-terminal) run for a conversation.
   * Returns the updated run, or null if no active run exists.
   */
  updateCurrentStep(
    conversationId: Types.ObjectId,
    step: string,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * List all runs for a conversation, ordered by runNumber descending.
   */
  listRuns(
    conversationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun[], DBError>>;
}
