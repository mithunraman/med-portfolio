import { OutboxStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import { TransactionService } from '../database/transaction.service';
import { CreateOutboxEntryData, DBError, IOutboxRepository } from './outbox.repository.interface';
import { OutboxEntry, OutboxEntryDocument } from './schemas/outbox.schema';

/** Exponential backoff: 2^attempts * 1000ms (2s, 4s, 8s, 16s...) */
function calculateBackoffMs(attempts: number): number {
  return Math.pow(2, attempts) * 1000;
}

@Injectable()
export class OutboxRepository implements IOutboxRepository {
  private readonly logger = new Logger(OutboxRepository.name);

  constructor(
    @InjectModel(OutboxEntry.name)
    private outboxModel: Model<OutboxEntryDocument>,
    private readonly transactionService: TransactionService
  ) {}

  async create(
    data: CreateOutboxEntryData,
    session?: ClientSession
  ): Promise<Result<OutboxEntry, DBError>> {
    try {
      const [entry] = await this.outboxModel.create(
        [
          {
            type: data.type,
            payload: data.payload,
            maxAttempts: data.maxAttempts ?? 3,
            processAfter: data.processAfter ?? new Date(),
          },
        ],
        { session }
      );
      return ok(entry);
    } catch (error) {
      this.logger.error('Failed to create outbox entry', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create outbox entry' });
    }
  }

  async claimBatch(
    batchSize: number,
    lockDurationMs: number
  ): Promise<Result<OutboxEntry[], DBError>> {
    try {
      const now = new Date();
      const lockedUntil = new Date(now.getTime() + lockDurationMs);
      const claimed: OutboxEntry[] = [];

      // Claim jobs one by one using findOneAndUpdate for atomicity
      for (let i = 0; i < batchSize; i++) {
        const entry = await this.outboxModel
          .findOneAndUpdate(
            {
              status: OutboxStatus.PENDING,
              processAfter: { $lte: now },
              $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
            },
            {
              $set: {
                status: OutboxStatus.PROCESSING,
                lockedUntil,
              },
            },
            { new: true, sort: { processAfter: 1 } }
          )
          .lean();

        if (!entry) break; // No more jobs available
        claimed.push(entry);
      }

      return ok(claimed);
    } catch (error) {
      this.logger.error('Failed to claim outbox batch', error);
      return err({ code: 'DB_ERROR', message: 'Failed to claim outbox batch' });
    }
  }

  async markCompleted(entryId: Types.ObjectId): Promise<Result<OutboxEntry | null, DBError>> {
    try {
      const entry = await this.outboxModel
        .findOneAndUpdate(
          { _id: entryId, status: OutboxStatus.PROCESSING },
          { $set: { status: OutboxStatus.COMPLETED, lockedUntil: null } },
          { new: true }
        )
        .lean();
      return ok(entry);
    } catch (error) {
      this.logger.error('Failed to mark outbox entry as completed', error);
      return err({ code: 'DB_ERROR', message: 'Failed to mark outbox entry as completed' });
    }
  }

  async markFailed(
    entryId: Types.ObjectId,
    error: string
  ): Promise<Result<OutboxEntry | null, DBError>> {
    try {
      const entry = await this.transactionService.withTransaction(
        async (session) => {
          const current = await this.outboxModel.findById(entryId).session(session).lean();
          if (!current || current.status !== OutboxStatus.PROCESSING) return null;

          const newAttempts = current.attempts + 1;
          const isPermanentFailure = newAttempts >= current.maxAttempts;

          const update: Record<string, unknown> = {
            attempts: newAttempts,
            lastError: error,
            lockedUntil: null,
          };

          if (isPermanentFailure) {
            update.status = OutboxStatus.FAILED;
          } else {
            update.status = OutboxStatus.PENDING;
            update.processAfter = new Date(Date.now() + calculateBackoffMs(newAttempts));
          }

          await this.outboxModel.updateOne({ _id: entryId }, { $set: update }, { session });

          return await this.outboxModel.findById(entryId).session(session).lean();
        },
        { context: 'outbox-mark-failed' }
      );

      return ok(entry);
    } catch (err_) {
      this.logger.error('Failed to mark outbox entry as failed', err_);
      return err({ code: 'DB_ERROR', message: 'Failed to mark outbox entry as failed' });
    }
  }

  async resetStaleLocks(): Promise<Result<number, DBError>> {
    try {
      const now = new Date();
      const result = await this.outboxModel.updateMany(
        {
          status: OutboxStatus.PROCESSING,
          lockedUntil: { $lte: now },
        },
        {
          $set: {
            status: OutboxStatus.PENDING,
            lockedUntil: null,
          },
        }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to reset stale locks', error);
      return err({ code: 'DB_ERROR', message: 'Failed to reset stale locks' });
    }
  }

  async cleanupOldEntries(
    olderThan: Date,
    statuses: OutboxStatus[]
  ): Promise<Result<number, DBError>> {
    try {
      const result = await this.outboxModel.deleteMany({
        status: { $in: statuses },
        updatedAt: { $lte: olderThan },
      });
      return ok(result.deletedCount);
    } catch (error) {
      this.logger.error('Failed to cleanup old outbox entries', error);
      return err({ code: 'DB_ERROR', message: 'Failed to cleanup old outbox entries' });
    }
  }
}
