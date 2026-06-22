import { AnalysisRunStatus } from '@acme/shared';
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

const TERMINAL_STATUSES = [AnalysisRunStatus.COMPLETED, AnalysisRunStatus.FAILED];

// Runs a worker is processing or about to process. AWAITING_INPUT is excluded
// deliberately: it is parked at an interrupt waiting on the user, with no worker
// attached, so it is safe to tombstone underneath.
const EXECUTING_STATUSES = [AnalysisRunStatus.PENDING, AnalysisRunStatus.RUNNING];

/**
 * Single source of truth for the AnalysisRun tombstone payload. Used by every
 * deletion path on this repo. Adding a new sensitive field belongs here.
 */
export function analysisRunTombstoneUpdate() {
  return {
    $set: {
      status: AnalysisRunStatus.DELETED,
      langGraphThreadId: '[deleted]',
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
          status: { $nin: TERMINAL_STATUSES },
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
          { conversationId, status: { $nin: TERMINAL_STATUSES } },
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
