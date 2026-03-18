import { AnalysisRunStatus } from '@acme/shared';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
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
    private readonly repository: IAnalysisRunsRepository
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
    idempotencyKey: string,
    session?: ClientSession
  ): Promise<{ run: AnalysisRun; created: boolean }> {
    // Check for existing run with same idempotency key
    const existingResult = await this.repository.findRunByIdempotencyKey(
      conversationId,
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
    const maxResult = await this.repository.getMaxRunNumber(conversationId, session);
    if (!maxResult.ok) {
      throw new Error(maxResult.error.message);
    }
    const runNumber = maxResult.value + 1;
    const langGraphThreadId = `${conversationId.toString()}:${runNumber}`;

    const createResult = await this.repository.createRun(
      {
        conversationId,
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
    expectedStatus: AnalysisRunStatus,
    newStatus: AnalysisRunStatus,
    additionalUpdates?: Omit<UpdateAnalysisRunData, 'status'>,
    session?: ClientSession
  ): Promise<AnalysisRun> {
    const result = await this.repository.updateRunStatus(
      runId,
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
  async updateCurrentStep(conversationId: Types.ObjectId, step: string): Promise<void> {
    const result = await this.repository.updateCurrentStep(conversationId, step);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }

  async findLatestRun(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<AnalysisRun | null> {
    const result = await this.repository.findLatestRun(conversationId, session);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  async findActiveRun(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<AnalysisRun | null> {
    const result = await this.repository.findActiveRun(conversationId, session);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  async findRunByXid(xid: string): Promise<AnalysisRun | null> {
    const result = await this.repository.findRunByXid(xid);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  async findRunById(runId: Types.ObjectId, session?: ClientSession): Promise<AnalysisRun | null> {
    const result = await this.repository.findRunById(runId, session);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  async listRuns(conversationId: Types.ObjectId): Promise<AnalysisRun[]> {
    const result = await this.repository.listRuns(conversationId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }
}
