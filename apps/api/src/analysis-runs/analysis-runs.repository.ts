import {
  AnalysisRunStatus,
  EXECUTING_RUN_STATUSES,
  NON_TERMINAL_RUN_STATUSES,
} from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { isTransientTransactionError } from '../common/utils/mongo-errors.util';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import {
  CreateAnalysisRunData,
  IAnalysisRunsRepository,
  UpdateAnalysisRunData,
} from './analysis-runs.repository.interface';
import { AnalysisRun, AnalysisRunDocument } from './schemas/analysis-run.schema';

// Runs still holding their conversation's single active slot. Sourced from the
// shared set — NOT a local list — so it cannot go stale when a status is added.
// A local `TERMINAL_STATUSES = [COMPLETED, FAILED]` used to live here and was
// missed when EXPIRED was introduced, which made an expired run read as active
// and 409 every attempt to start a new one.
const ACTIVE_STATUSES = [...NON_TERMINAL_RUN_STATUSES];

// Runs a worker is processing or about to process — a different concept from
// ACTIVE_STATUSES above, which includes AWAITING_INPUT. Sourced from the shared
// set for the same reason: the sweeper's six-hour staleness clock names the same
// statuses, and a local copy here would let the two drift silently. See the
// EXECUTING_RUN_STATUSES docblock for what each side breaks when they do.
const EXECUTING_STATUSES = [...EXECUTING_RUN_STATUSES];

/**
 * Single source of truth for the AnalysisRun tombstone payload. Used by every
 * deletion path on this repo. Adding a new sensitive field belongs here.
 *
 * `langGraphThreadId` is deliberately NOT cleared: it is the only handle to that
 * run's rows in `checkpoints` / `checkpoint_writes`, which hold trainee clinical
 * content. Keeping it is what lets the account-deletion cascade run this
 * tombstone and the checkpoint purge concurrently under `Promise.allSettled`
 * without one destroying the other's input. See `tombstone.spec.ts`.
 */
export function analysisRunTombstoneUpdate() {
  return {
    $set: {
      status: AnalysisRunStatus.DELETED,
      currentStep: null,
      currentQuestion: null,
      error: null,
      reflectTrace: null,
      refineTrace: null,
    },
  };
}

/**
 * Ownership model — read before adding a userId predicate here.
 *
 * AnalysisRun has NO userId field; it is owned transitively through its
 * `conversationId` (a run belongs to a conversation, which belongs to a user).
 * Reads/mutations therefore scope by conversationId/runId, not userId, and that
 * is correct — there is no userId on the document to filter by.
 *
 * These methods are also SYSTEM-CONTEXT code: every mutating caller is an outbox
 * handler / graph node operating on a server-derived runId or conversationId
 * (from job state or the LangGraph checkpoint), never request input. The
 * conversation's owner is verified upstream in the request-facing services
 * before any run is started or resumed. This is the system/no-user-caller
 * carve-out in CLAUDE.md's "Ownership predicate at the persistence layer" rule —
 * do not plumb userId through the outbox/graph pipeline to "scope" these.
 */
@Injectable()
export class AnalysisRunsRepository implements IAnalysisRunsRepository {
  private readonly logger = new Logger(AnalysisRunsRepository.name);

  constructor(
    @InjectModel(AnalysisRun.name)
    private analysisRunModel: Model<AnalysisRunDocument>
  ) {}

  async createRun(
    data: CreateAnalysisRunData,
    session?: ClientSession
  ): Promise<Result<AnalysisRun, DBError>> {
    try {
      const [run] = await this.analysisRunModel.create(
        [
          {
            conversationId: data.conversationId,
            runNumber: data.runNumber,
            idempotencyKey: data.idempotencyKey,
            langGraphThreadId: data.langGraphThreadId,
            snapshotRange: data.snapshotRange ?? { fromMessageId: null, toMessageId: null },
          },
        ],
        { session }
      );
      return ok(run);
    } catch (error: any) {
      if (error?.code === 11000) {
        this.logger.warn(`Duplicate analysis run rejected for conversation ${data.conversationId}`);
        return err({
          code: 'DUPLICATE_ACTIVE_RUN',
          message: 'An active run already exists for this conversation',
        });
      }
      // Let transient transaction errors bubble so the surrounding TransactionService
      // can retry the whole transaction — converting them to a Result here would strip
      // the TransientTransactionError label and turn a retryable blip into a hard failure.
      if (isTransientTransactionError(error)) {
        throw error;
      }
      this.logger.error('Failed to create analysis run', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create analysis run' });
    }
  }

  async findRunById(
    runId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findById(runId)
        .lean()
        .session(session || null);
      return ok(run);
    } catch (error) {
      this.logger.error('Failed to find analysis run by id', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find analysis run by id' });
    }
  }

  async findRunByIdempotencyKey(
    conversationId: Types.ObjectId,
    idempotencyKey: string,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({ conversationId, idempotencyKey })
        .lean()
        .session(session || null);
      return ok(run);
    } catch (error) {
      this.logger.error('Failed to find analysis run by idempotency key', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find analysis run by idempotency key' });
    }
  }

  async findActiveRun(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({
          conversationId,
          status: { $in: ACTIVE_STATUSES },
        })
        .sort({ createdAt: -1 })
        .lean()
        .session(session || null);
      return ok(run);
    } catch (error) {
      this.logger.error('Failed to find active analysis run', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find active analysis run' });
    }
  }

  async findExecutingRun(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({
          conversationId,
          status: { $in: EXECUTING_STATUSES },
        })
        .sort({ createdAt: -1 })
        .lean()
        .session(session || null);
      return ok(run);
    } catch (error) {
      this.logger.error('Failed to find executing analysis run', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find executing analysis run' });
    }
  }

  async findLatestRun(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({ conversationId })
        .sort({ createdAt: -1 })
        .lean()
        .session(session || null);
      return ok(run);
    } catch (error) {
      this.logger.error('Failed to find latest analysis run', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find latest analysis run' });
    }
  }

  async updateRunStatus(
    runId: Types.ObjectId,
    expectedStatus: AnalysisRunStatus,
    updates: UpdateAnalysisRunData,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOneAndUpdate({ _id: runId, status: expectedStatus }, { $set: updates }, { new: true })
        .lean()
        .session(session || null);
      return ok(run);
    } catch (error) {
      this.logger.error('Failed to update analysis run status', error);
      return err({ code: 'DB_ERROR', message: 'Failed to update analysis run status' });
    }
  }

  async getMaxRunNumber(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({ conversationId })
        .sort({ runNumber: -1 })
        .select('runNumber')
        .lean()
        .session(session || null);
      return ok(run?.runNumber ?? 0);
    } catch (error) {
      this.logger.error('Failed to get max run number', error);
      return err({ code: 'DB_ERROR', message: 'Failed to get max run number' });
    }
  }

  async updateCurrentStep(
    conversationId: Types.ObjectId,
    step: string
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOneAndUpdate(
          { conversationId, status: { $in: ACTIVE_STATUSES } },
          { $set: { currentStep: step } },
          { new: true, sort: { createdAt: -1 } }
        )
        .lean();
      return ok(run);
    } catch (error) {
      this.logger.error('Failed to update current step', error);
      return err({ code: 'DB_ERROR', message: 'Failed to update current step' });
    }
  }

  async listRuns(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun[], DBError>> {
    try {
      const runs = await this.analysisRunModel
        .find({ conversationId })
        .sort({ runNumber: -1 })
        .lean()
        .session(session || null);
      return ok(runs);
    } catch (error) {
      this.logger.error('Failed to list analysis runs', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list analysis runs' });
    }
  }

  async findRunsForSweepBatch(
    statuses: AnalysisRunStatus[],
    cutoff: Date,
    limit: number
  ): Promise<Result<Array<Pick<AnalysisRun, '_id' | 'status' | 'langGraphThreadId'>>, DBError>> {
    try {
      const runs = await this.analysisRunModel
        .find({
          // `$in` on the leading index key produces one interval per value and
          // stays tightly bounded — measured at 26 keys examined for 25 docs
          // returned. There is no reason for a caller to issue one query per
          // status.
          status: { $in: statuses },
          updatedAt: { $lt: cutoff },
          // Must stay identical to the index's partialFilterExpression, or the
          // planner cannot prove the query is a subset of it and silently falls
          // back to a collection scan.
          checkpointsPurgedAt: null,
        })
        .select('status langGraphThreadId')
        .limit(limit)
        .lean();
      return ok(runs);
    } catch (error) {
      this.logger.error('Failed to find analysis runs for sweep', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find analysis runs for sweep' });
    }
  }

  async expireStaleRuns(
    statuses: AnalysisRunStatus[],
    cutoff: Date
  ): Promise<Result<number, DBError>> {
    try {
      const result = await this.analysisRunModel.updateMany(
        {
          // This predicate is the optimistic lock. Mongo evaluates it per
          // document at modification time, so a run that resumed before the
          // write reached it no longer matches and survives untouched — the same
          // guarantee the old per-run findOneAndUpdate(_id, status) gave.
          status: { $in: statuses },
          updatedAt: { $lt: cutoff },
          // Semantically redundant (a non-terminal run is never purged) but
          // required for index eligibility: the sweep index is partial on
          // `checkpointsPurgedAt: null`, and without the clause the planner
          // cannot prove the query is a subset of it and falls back to a
          // collection scan — measured at 20k docs examined vs 3.3k.
          checkpointsPurgedAt: null,
        },
        {
          $set: {
            status: AnalysisRunStatus.EXPIRED,
            // Cleared because they only describe a live run. Dropping
            // currentQuestion is also what makes the client stop rendering the
            // stale question as answerable.
            currentStep: null,
            currentQuestion: null,
          },
        }
        // NOTE: `timestamps` is deliberately left on. Bumping `updatedAt` here
        // is load-bearing — the purge grace period is measured from it, so an
        // expired run becomes collectable a grace window after EXPIRY, not after
        // whenever the trainee last touched it. Passing `{ timestamps: false }`
        // would silently make every long-abandoned run purgeable immediately.
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to expire stale analysis runs', error);
      return err({ code: 'DB_ERROR', message: 'Failed to expire stale analysis runs' });
    }
  }

  async markCheckpointsPurged(
    runIds: Types.ObjectId[],
    now: Date
  ): Promise<Result<number, DBError>> {
    if (runIds.length === 0) return ok(0);
    try {
      const result = await this.analysisRunModel.updateMany(
        { _id: { $in: runIds } },
        { $set: { checkpointsPurgedAt: now } }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark checkpoints purged', error);
      return err({ code: 'DB_ERROR', message: 'Failed to mark checkpoints purged' });
    }
  }

  async findThreadIdsByConversationIds(
    conversationIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<string[], DBError>> {
    if (conversationIds.length === 0) return ok([]);
    try {
      const runs = await this.analysisRunModel
        .find({ conversationId: { $in: conversationIds } })
        .select('langGraphThreadId')
        .session(session ?? null)
        .lean();
      // Unfiltered on purpose. `string[]` — not `(string | null)[]` — is the
      // guard: if `langGraphThreadId` ever becomes nullable, this line fails to
      // compile. A `.filter((id): id is string => ...)` here would keep
      // compiling and silently shrink the set instead, and the set is what
      // account deletion purges — a dropped id means checkpoint data (full graph
      // state, trainee clinical content) surviving an erasure request.
      return ok(runs.map((r) => r.langGraphThreadId));
    } catch (error) {
      this.logger.error('Failed to resolve thread ids by conversation ids', error);
      return err({
        code: 'DB_ERROR',
        message: 'Failed to resolve thread ids by conversation ids',
      });
    }
  }

  async markDeletedByConversationIds(
    conversationIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (conversationIds.length === 0) return ok(0);
    try {
      const result = await this.analysisRunModel.updateMany(
        {
          conversationId: { $in: conversationIds },
          status: { $ne: AnalysisRunStatus.DELETED },
        },
        analysisRunTombstoneUpdate(),
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark analysis runs deleted by conversation ids', error);
      return err({
        code: 'DB_ERROR',
        message: 'Failed to mark analysis runs deleted by conversation ids',
      });
    }
  }

  async markDeletedByArtefactIds(
    artefactIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (artefactIds.length === 0) return ok(0);
    try {
      const result = await this.analysisRunModel.updateMany(
        {
          artefactId: { $in: artefactIds },
          status: { $ne: AnalysisRunStatus.DELETED },
        },
        analysisRunTombstoneUpdate(),
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark analysis runs deleted by artefact ids', error);
      return err({
        code: 'DB_ERROR',
        message: 'Failed to mark analysis runs deleted by artefact ids',
      });
    }
  }
}
