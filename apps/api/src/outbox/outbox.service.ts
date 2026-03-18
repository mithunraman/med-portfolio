import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import {
  CreateOutboxEntryData,
  IOutboxRepository,
  OUTBOX_REPOSITORY,
} from './outbox.repository.interface';
import type { OutboxEntry } from './schemas/outbox.schema';

/** Default lock duration: 10 minutes */
const DEFAULT_LOCK_DURATION_MS = 10 * 60 * 1000;

/** Default batch size for claiming jobs */
const DEFAULT_BATCH_SIZE = 5;

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @Inject(OUTBOX_REPOSITORY)
    private readonly repository: IOutboxRepository
  ) {}

  /**
   * Enqueue a new job to the outbox.
   * Should be called within a transaction alongside the business write
   * to guarantee atomic enqueue.
   */
  async enqueue(data: CreateOutboxEntryData, session?: ClientSession): Promise<OutboxEntry> {
    const result = await this.repository.create(data, session);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  /**
   * Claim a batch of pending jobs for processing.
   * Each claimed job gets a lock (lockedUntil) to prevent other consumers from claiming it.
   */
  async claimBatch(
    batchSize: number = DEFAULT_BATCH_SIZE,
    lockDurationMs: number = DEFAULT_LOCK_DURATION_MS
  ): Promise<OutboxEntry[]> {
    const result = await this.repository.claimBatch(batchSize, lockDurationMs);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    return result.value;
  }

  /**
   * Mark a job as successfully completed.
   */
  async markCompleted(entryId: Types.ObjectId): Promise<void> {
    const result = await this.repository.markCompleted(entryId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }

  /**
   * Mark a job as failed. Handles retry scheduling or permanent failure automatically.
   */
  async markFailed(entryId: Types.ObjectId, error: string): Promise<void> {
    const result = await this.repository.markFailed(entryId, error);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }

  /**
   * Reset stale processing entries whose locks have expired.
   * Should be called periodically to handle consumer crashes.
   */
  async resetStaleLocks(): Promise<number> {
    const result = await this.repository.resetStaleLocks();
    if (!result.ok) {
      this.logger.error('Failed to reset stale locks', result.error);
      return 0;
    }
    if (result.value > 0) {
      this.logger.warn(`Reset ${result.value} stale outbox locks`);
    }
    return result.value;
  }
}
