import { AnalysisRunStatus } from '@acme/shared';
import { ConflictException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import {
  CHECKPOINT_REPOSITORY,
  ICheckpointRepository,
} from '../checkpoints/checkpoint.repository.interface';
import { isErr, unwrapVoid } from '../common/utils/result.util';
import {
  ANALYSIS_RUNS_REPOSITORY,
  IAnalysisRunsRepository,
  UpdateAnalysisRunData,
} from './analysis-runs.repository.interface';
import type { AnalysisRun } from './schemas/analysis-run.schema';

@Injectable()
export class AnalysisRunsService {
  constructor(
    @Inject(ANALYSIS_RUNS_REPOSITORY)
    private readonly repository: IAnalysisRunsRepository,
    @Inject(CHECKPOINT_REPOSITORY)
    private readonly checkpointRepository: ICheckpointRepository
  ) {}

  /**
   * Create a new analysis run or return an existing one if the idempotency key matches.
   * Returns { run, created } to distinguish between new and existing runs.
   *
   * The langGraphThreadId is derived internally as `${conversationId}:${runNumber}`.
   * Each run gets its own LangGraph thread namespace, allowing restart after FAILED
   * without stale checkpoints blocking the new run.
   */
  async createRun(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    idempotencyKey: string,
    session?: ClientSession
  ): Promise<{ run: AnalysisRun; created: boolean }> {
    // Check for existing run with same idempotency key
    const existingResult = await this.repository.findRunByIdempotencyKey(
      conversationId,
      userId,
      idempotencyKey,
      session
    );
    if (!existingResult.ok) {
      throw new Error(existingResult.error.message);
    }
    if (existingResult.value) {
      return { run: existingResult.value, created: false };
    }

    // Determine next run number
    const maxResult = await this.repository.getMaxRunNumber(conversationId, userId, session);
    if (!maxResult.ok) {
      throw new Error(maxResult.error.message);
    }
    const runNumber = maxResult.value + 1;
    const langGraphThreadId = `${conversationId.toString()}:${runNumber}`;

    const createResult = await this.repository.createRun(
      {
        conversationId,
        userId,
        runNumber,
        idempotencyKey,
        langGraphThreadId,
      },
      session
    );
    if (!createResult.ok) {
      if (createResult.error.code === 'DUPLICATE_ACTIVE_RUN') {
        throw new ConflictException(createResult.error.message);
      }
      throw new Error(createResult.error.message);
    }

    return { run: createResult.value, created: true };
  }

  /**
   * Atomically transition run status with optimistic locking.
   * Throws if the run doesn't exist or the expected status doesn't match.
   */
  async transitionStatus(
    runId: Types.ObjectId,
    userId: Types.ObjectId,
    expectedStatus: AnalysisRunStatus,
    newStatus: AnalysisRunStatus,
    additionalUpdates?: Omit<UpdateAnalysisRunData, 'status'>,
    session?: ClientSession
  ): Promise<AnalysisRun> {
    const result = await this.repository.updateRunStatus(
      runId,
      userId,
      expectedStatus,
      { ...additionalUpdates, status: newStatus },
      session
    );
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    if (!result.value) {
      throw new Error(
        `Failed to transition analysis run ${runId} from ${expectedStatus} to ${newStatus}: ` +
          'run not found or status mismatch (optimistic lock failure)'
      );
    }
    return result.value;
  }

  /**
   * Update the currentStep field on the active run for a conversation.
   * Used by the event listener to track graph node progress.
   */
  /**
   * Returns whether a run was actually updated. A `false` here is not an error —
   * the filter requires an ACTIVE run for this (conversation, owner) pair, and a
   * terminated run legitimately matches nothing. But it must not be reported as
   * success: the caller previously logged "Updated currentStep" unconditionally,
   * which turned a no-match into a false positive in the logs.
   */
  async updateCurrentStep(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    step: string
  ): Promise<boolean> {
    const result = await this.repository.updateCurrentStep(conversationId, userId, step);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value !== null;
  }

  async findLatestRun(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<AnalysisRun | null> {
    const result = await this.repository.findLatestRun(conversationId, userId, session);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  async findActiveRun(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<AnalysisRun | null> {
    const result = await this.repository.findActiveRun(conversationId, userId, session);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  /**
   * Find a run a worker is processing or about to process (PENDING, RUNNING).
   * Unlike findActiveRun, this excludes AWAITING_INPUT — a run parked at an
   * interrupt waiting on the user is safe to delete underneath.
   */
  async findExecutingRun(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<AnalysisRun | null> {
    const result = await this.repository.findExecutingRun(conversationId, userId, session);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  async findRunById(
    runId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<AnalysisRun | null> {
    const result = await this.repository.findRunById(runId, userId, session);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  async listRuns(conversationId: Types.ObjectId, userId: Types.ObjectId): Promise<AnalysisRun[]> {
    const result = await this.repository.listRuns(conversationId, userId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  /**
   * Cascade entry point: tombstone analysis runs for the given conversations and
   * hard-delete their LangGraph checkpoint data.
   *
   * ## Why the purge belongs here and not seven days later
   *
   * The sibling tombstones in this cascade scrub clinical content synchronously
   * — `messageTombstoneUpdate` overwrites rawContent/redactedContent/content,
   * `artefactTombstoneUpdate` wipes the composed document and every note, and
   * the run tombstone nulls reflectTrace/refineTrace for exactly that reason.
   * `checkpoints` holds a verbatim copy of the same transcript and drafted entry
   * at every superstep, reachable through the `langGraphThreadId` the tombstone
   * deliberately preserves. Leaving it to the sweeper's grace window would make
   * all of that scrubbing cosmetic for a week.
   *
   * Thread ids are resolved BEFORE the tombstone runs only for clarity — the
   * tombstone keeps `langGraphThreadId`, so either order resolves the same set.
   *
   * `checkpointsPurgedAt` is deliberately left null: the sweeper then revisits
   * these runs once at day 7, deletes nothing, and marks them. That costs a
   * single batch and buys a standing check that this path actually worked.
   */
  async deleteByConversationIds(
    conversationIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<void> {
    const threadIdsResult = await this.repository.findThreadIdsByConversationIds(
      conversationIds,
      userId,
      session
    );
    // Throws rather than falling back to []: an empty list here would silently
    // no-op the purge below and leave the content behind with nothing to show
    // for it. Same contract as the account-cleanup resolver.
    if (isErr(threadIdsResult)) {
      throw new InternalServerErrorException(threadIdsResult.error.message);
    }
    unwrapVoid(await this.repository.markDeletedByConversationIds(conversationIds, userId, session));
    // Session forwarded: this is a hard delete, and an aborted cascade must not
    // leave the graph state destroyed for an entry that still exists.
    unwrapVoid(await this.checkpointRepository.purgeThreads(threadIdsResult.value, session));
  }

  /**
   * Cascade entry point: tombstone analysis runs linked to the given artefacts.
   *
   * No checkpoint purge here, deliberately. Every run carries a `conversationId`
   * and `artefacts.deleteByIds` cascades through `conversationsService` first, so
   * `deleteByConversationIds` above has already purged everything this could
   * reach — this call exists to catch runs linked by `artefactId` alone. If one
   * ever did escape both, the sweeper collects it at the grace window.
   */
  async deleteByArtefactIds(
    artefactIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<void> {
    unwrapVoid(await this.repository.markDeletedByArtefactIds(artefactIds, userId, session));
  }
}
