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
 * Ownership model — read before changing how these methods filter.
 *
 * AnalysisRun carries its own `userId`, denormalised from the parent conversation
 * and written once by `createRun`. Every request-facing read and mutation below
 * scopes by it. `findRunsForSweepBatch`, `expireStaleRuns` and
 * `markCheckpointsPurged` are the documented exceptions — they run on the
 * retention cron and must cross every user by design; see the block above them.
 *
 * ## Why the field exists, and what it replaced
 *
 * Runs were previously owned *transitively* through `conversationId`, with no
 * `userId` on the document, and that was a deliberate decision rather than an
 * oversight — the argument being that every caller here is SYSTEM-CONTEXT code
 * (an outbox handler or graph node acting on a server-derived runId or
 * conversationId, never on request input) with the conversation's owner already
 * verified upstream.
 *
 * That held only as long as the upstream check held. It is the same
 * caller-discipline coupling CLAUDE.md's "Ownership predicate at the persistence
 * layer" rule exists to remove: a future caller wiring one of these methods to a
 * new route would get no compiler or test signal. The field was added so the
 * predicate is enforceable in the filter. Do not restore the transitive model.
 *
 * The system-context observation is still true, and is now the reason `userId`
 * is threaded through the outbox payloads and `AnalysisStepStartedEvent` rather
 * than read from a request: there is no request to read it from.
 *
 * ## `userId` is compliance-bearing
 *
 * `findThreadIdsByConversationIds` filters by it to build the target list for a
 * hard delete of LangGraph checkpoints, so account erasure completeness now
 * depends on this field being correct on every run. It is `required` on the
 * schema and nothing writes it after creation. Keep it that way — see the note
 * on that method before making it optional or mutable.
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
            userId: data.userId,
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
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({ userId, _id: runId })
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
    userId: Types.ObjectId,
    idempotencyKey: string,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({ userId, conversationId, idempotencyKey })
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
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({
          userId,
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
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({
          userId,
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
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({ userId, conversationId })
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
    userId: Types.ObjectId,
    expectedStatus: AnalysisRunStatus,
    updates: UpdateAnalysisRunData,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOneAndUpdate(
          { userId, _id: runId, status: expectedStatus },
          { $set: updates },
          { new: true }
        )
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
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({ userId, conversationId })
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
    userId: Types.ObjectId,
    step: string
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOneAndUpdate(
          { userId, conversationId, status: { $in: ACTIVE_STATUSES } },
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
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<AnalysisRun[], DBError>> {
    try {
      const runs = await this.analysisRunModel
        .find({ userId, conversationId })
        .sort({ runNumber: -1 })
        .lean()
        .session(session || null);
      return ok(runs);
    } catch (error) {
      this.logger.error('Failed to list analysis runs', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list analysis runs' });
    }
  }

  // ─── Deliberately NOT owner-scoped ───
  //
  // The three sweeper methods below run on the retention cron and must cross every
  // user by design. `userId` is absent from their filters on purpose — do not add it.

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

  /**
   * Owner-scoped despite being a read, for the same reason as
   * `findIdsByArtefactIds`: this list is the target of `purgeThreads`, a HARD
   * delete against collections that carry no `userId` of their own. A foreign
   * thread id surviving this query is unrecoverable loss of another user's
   * graph state, and the run tombstone beside it IS scoped — so the victim
   * would be left with a live run pointing at deleted checkpoints.
   *
   * The `userId` predicate cuts both ways, and the second edge matters:
   * ERASURE COMPLETENESS NOW DEPENDS ON `AnalysisRun.userId` BEING CORRECT.
   * The account-deletion path passes the user's own conversations, so the
   * filter drops nothing there today — but a run with a wrong or missing
   * `userId` would have its checkpoints survive an Art 17 request. Treat that
   * field as compliance-bearing: it is `required` on the schema, and nothing
   * should make it optional or writable after creation.
   */
  async findThreadIdsByConversationIds(
    conversationIds: Types.ObjectId[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<string[], DBError>> {
    if (conversationIds.length === 0) return ok([]);
    try {
      const runs = await this.analysisRunModel
        .find({ userId, conversationId: { $in: conversationIds } })
        .select('langGraphThreadId')
        .session(session ?? null)
        .lean();
      // Not null-filtered. `string[]` — not `(string | null)[]` — is the guard:
      // if `langGraphThreadId` ever becomes nullable, this line fails to
      // compile. A `.filter((id): id is string => ...)` here would keep
      // compiling and silently shrink the set instead, and the set is what
      // account deletion purges — a dropped id means checkpoint data (full graph
      // state, trainee clinical content) surviving an erasure request. The
      // owner predicate above is the one deliberate narrowing; see the note.
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
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (conversationIds.length === 0) return ok(0);
    try {
      const result = await this.analysisRunModel.updateMany(
        {
          userId,
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
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (artefactIds.length === 0) return ok(0);
    try {
      const result = await this.analysisRunModel.updateMany(
        {
          userId,
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
