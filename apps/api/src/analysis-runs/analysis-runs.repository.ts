import { AnalysisRunStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import {
  CreateAnalysisRunData,
  DBError,
  IAnalysisRunsRepository,
  UpdateAnalysisRunData,
} from './analysis-runs.repository.interface';
import { AnalysisRun, AnalysisRunDocument } from './schemas/analysis-run.schema';

const TERMINAL_STATUSES = [AnalysisRunStatus.COMPLETED, AnalysisRunStatus.FAILED];

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
      this.logger.error('Failed to create analysis run', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create analysis run' });
    }
  }

  async findRunByXid(
    xid: string,
    session?: ClientSession
  ): Promise<Result<AnalysisRun | null, DBError>> {
    try {
      const run = await this.analysisRunModel
        .findOne({ xid })
        .lean()
        .session(session || null);
      return ok(run);
    } catch (error) {
      this.logger.error('Failed to find analysis run by xid', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find analysis run by xid' });
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

  async anonymizeByConversationIds(
    conversationIds: Types.ObjectId[]
  ): Promise<Result<number, DBError>> {
    try {
      const result = await this.analysisRunModel.updateMany(
        { conversationId: { $in: conversationIds } },
        {
          $set: {
            status: AnalysisRunStatus.DELETED,
            langGraphThreadId: '[deleted]',
            currentStep: null,
            currentQuestion: null,
            error: null,
          },
        }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to anonymize analysis runs', error);
      return err({ code: 'DB_ERROR', message: 'Failed to anonymize analysis runs' });
    }
  }
}
