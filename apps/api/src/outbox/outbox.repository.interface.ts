import { OutboxStatus } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { Result } from '../common/utils/result.util';
import type { OutboxEntry } from './schemas/outbox.schema';

export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');

export interface DBError {
  code: string;
  message: string;
}

export interface CreateOutboxEntryData {
  type: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  processAfter?: Date;
}

export interface IOutboxRepository {
  /**
   * Enqueue a new outbox entry.
   */
  create(
    data: CreateOutboxEntryData,
    session?: ClientSession,
  ): Promise<Result<OutboxEntry, DBError>>;

  /**
   * Atomically claim a batch of pending jobs that are ready to process.
   * Uses optimistic locking via lockedUntil.
   * Returns the claimed entries with status set to PROCESSING.
   */
  claimBatch(
    batchSize: number,
    lockDurationMs: number,
  ): Promise<Result<OutboxEntry[], DBError>>;

  /**
   * Mark a job as completed.
   */
  markCompleted(
    entryId: Types.ObjectId,
  ): Promise<Result<OutboxEntry | null, DBError>>;

  /**
   * Mark a job as failed. If attempts < maxAttempts, reschedules with backoff.
   * Otherwise marks as permanently failed.
   */
  markFailed(
    entryId: Types.ObjectId,
    error: string,
  ): Promise<Result<OutboxEntry | null, DBError>>;

  /**
   * Reset stale processing entries whose locks have expired.
   * Returns the count of entries reset.
   */
  resetStaleLocks(): Promise<Result<number, DBError>>;

  /**
   * Delete completed/failed entries older than the given date.
   * Returns the count of entries deleted.
   */
  cleanupOldEntries(
    olderThan: Date,
    statuses: OutboxStatus[],
  ): Promise<Result<number, DBError>>;
}
