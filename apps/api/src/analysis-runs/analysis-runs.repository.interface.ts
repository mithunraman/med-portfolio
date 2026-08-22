import { AnalysisRunStatus } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { DBError, Result } from '../common/utils/result.util';
import type { AnalysisRun } from './schemas/analysis-run.schema';

export const ANALYSIS_RUNS_REPOSITORY = Symbol('ANALYSIS_RUNS_REPOSITORY');


export interface CreateAnalysisRunData {
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  runNumber: number;
  idempotencyKey: string;
  langGraphThreadId: string;
  snapshotRange?: {
    fromMessageId: Types.ObjectId | null;
    toMessageId: Types.ObjectId | null;
  };
}

type ReflectTrace = import('../portfolio-graph/portfolio-graph.state').ReflectTrace;
type RefineTrace = import('../portfolio-graph/portfolio-graph.state').RefineTrace;

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
  reflectTrace?: ReflectTrace | null;
  refineTrace?: RefineTrace | null;
}

export interface IAnalysisRunsRepository {
  createRun(
    data: CreateAnalysisRunData,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun, DBError>>;

  findRunById(
    runId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Find an existing run by conversation + idempotency key.
   * Used to implement idempotent triggers.
   */
  findRunByIdempotencyKey(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    idempotencyKey: string,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Find the active (non-terminal) run for a conversation.
   * Terminal statuses: COMPLETED, FAILED.
   */
  findActiveRun(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Find a run a worker is processing or about to process (PENDING, RUNNING).
   * Excludes AWAITING_INPUT, which is parked at an interrupt with no worker
   * attached. Used by delete guards that only need to block genuinely in-flight
   * work, not runs waiting on user input.
   */
  findExecutingRun(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Find the most recent run for a conversation, regardless of status.
   * Used by ConversationContextService to derive conversation phase.
   */
  findLatestRun(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * Atomically transition a run's status using optimistic locking.
   * Returns null if the run doesn't exist or expectedStatus doesn't match.
   */
  updateRunStatus(
    runId: Types.ObjectId,
    userId: Types.ObjectId,
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
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<number, DBError>>;

  /**
   * Update currentStep on the active (non-terminal) run for a conversation.
   * Returns the updated run, or null if no active run exists.
   */
  updateCurrentStep(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    step: string,
  ): Promise<Result<AnalysisRun | null, DBError>>;

  /**
   * List all runs for a conversation, ordered by runNumber descending.
   */
  listRuns(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<AnalysisRun[], DBError>>;

  /**
   * Terminal runs last touched before `cutoff` whose checkpoint data has not yet
   * been purged. Drives the sweeper's purge phase.
   *
   * Projects only what the purge acts on — `langGraphThreadId` is the handle to
   * the checkpoint rows, `status` is carried for logging. The documents
   * themselves hold graph traces there is no reason to pull into memory.
   */
  findRunsForSweepBatch(
    statuses: AnalysisRunStatus[],
    cutoff: Date,
    limit: number
  ): Promise<Result<Array<Pick<AnalysisRun, '_id' | 'status' | 'langGraphThreadId'>>, DBError>>;

  /**
   * Bulk-transition every run in `statuses` last touched before `cutoff` to
   * EXPIRED, clearing the fields that only make sense for a live run.
   *
   * ## The status predicate IS the optimistic lock
   *
   * MongoDB evaluates the filter per document at modification time, so a run
   * that resumed before this write reached it no longer matches and is left
   * alone. That is the same guarantee the per-run `findOneAndUpdate(_id, status)`
   * gave, without the query→write gap or one round trip per run.
   *
   * Returns the number of runs actually transitioned.
   */
  expireStaleRuns(
    statuses: AnalysisRunStatus[],
    cutoff: Date
  ): Promise<Result<number, DBError>>;

  /**
   * Stamp `checkpointsPurgedAt`. Idempotent; must only be called AFTER the
   * checkpoint data is actually gone.
   */
  markCheckpointsPurged(
    runIds: Types.ObjectId[],
    now: Date
  ): Promise<Result<number, DBError>>;

  /**
   * Resolve every LangGraph thread id belonging to the given conversations,
   * regardless of run status.
   *
   * Deliberately unfiltered by status: the account-deletion cascade must reach
   * checkpoint data for in-flight and already-tombstoned runs alike. Callers are
   * responsible for having established ownership of the conversations.
   */
  findThreadIdsByConversationIds(
    conversationIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<string[], DBError>>;

  /**
   * Bulk tombstone analysis runs for the given conversations. Idempotent.
   */
  markDeletedByConversationIds(
    conversationIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>>;

  /**
   * Bulk tombstone analysis runs linked to the given artefacts. Idempotent.
   */
  markDeletedByArtefactIds(
    artefactIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>>;
}
