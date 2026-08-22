import { OutboxStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { isTransientTransactionError } from '../common/utils/mongo-errors.util';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import { TransactionService } from '../database/transaction.service';
import { CreateOutboxEntryData, IOutboxRepository } from './outbox.repository.interface';
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
      // Let transient transaction errors bubble so the surrounding transaction can retry.
      if (isTransientTransactionError(error)) {
        throw error;
      }
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

  async countPending(): Promise<Result<number, DBError>> {
    try {
      const now = new Date();
      const count = await this.outboxModel.countDocuments({
        status: OutboxStatus.PENDING,
        processAfter: { $lte: now },
      });
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count pending outbox entries', error);
      return err({ code: 'DB_ERROR', message: 'Failed to count pending outbox entries' });
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

  async hasPendingByConversationId(
    conversationId: string
  ): Promise<Result<boolean, DBError>> {
    try {
      const count = await this.outboxModel.countDocuments(
        {
          'payload.conversationId': conversationId,
          type: { $in: ['analysis.start', 'analysis.resume'] },
          status: { $in: [OutboxStatus.PENDING, OutboxStatus.PROCESSING] },
        },
        { limit: 1 }
      );
      return ok(count > 0);
    } catch (error) {
      this.logger.error('Failed to check pending outbox entries', error);
      return err({ code: 'DB_ERROR', message: 'Failed to check pending outbox entries' });
    }
  }

  /**
   * Account erasure. Unions on two handles (`$or`) because NO single payload
   * field appears on every job type: `message.process` carries `userId` but no
   * `conversationId`, while the analysis jobs carry both. Matching on
   * `conversationId` alone would silently skip every queued message-processing
   * job for the account.
   *
   * The union is also the correct failure direction here. This method must
   * OVER-match: a job it misses keeps running after erasure, and the content it
   * touches is trainee clinical text, so a miss is an Art 17 failure rather than
   * a tidiness problem. Prefer cancelling one job too many.
   *
   * Contrast `cancelByConversationIds` below, which keys on `conversationId`
   * alone and must not under-match for the same reason in reverse. The two are
   * deliberately asymmetric — do not normalise one to the other.
   *
   * Known coupling: `'payload.userId'` is compared against `userId.toString()`,
   * so a producer that ever enqueues an ObjectId rather than a string silently
   * stops matching this branch. Nothing enforces the payload's shape today; the
   * durable fix is typing `enqueue` over a union of payload types.
   */
  async cancelByUser(
    userId: Types.ObjectId,
    conversationIds: string[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    try {
      const result = await this.outboxModel.updateMany(
        {
          status: { $in: [OutboxStatus.PENDING, OutboxStatus.PROCESSING] },
          $or: [
            { 'payload.userId': userId.toString() },
            { 'payload.conversationId': { $in: conversationIds } },
          ],
        },
        { $set: { status: OutboxStatus.FAILED, lastError: 'Account deleted' } },
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to cancel outbox entries for user', error);
      return err({ code: 'DB_ERROR', message: 'Failed to cancel outbox entries' });
    }
  }

  /**
   * `conversationId` is the whole key here, deliberately.
   *
   * DO NOT add `'payload.userId'` (or any other payload field) as a second
   * required match. Ownership is already satisfied: every `conversationIds` list
   * reaching this method is resolved through an owner-scoped query
   * (`findIdsByArtefactIds`, `findConversationIdsByUser`), and a conversation has
   * exactly one owner — so no other user's job can carry one of these ids.
   *
   * The cost of narrowing is asymmetric and points the wrong way. `payload` is
   * `Record<string, unknown>` with nothing enforcing its shape, so a required
   * payload field silently *under*-matches when absent. For a destructive write
   * that direction is safe (you damage less); for a cancellation it means failing
   * to stop queued work — the opposite of what this method exists to do. A job
   * type added later that carries `conversationId` but not `userId` would escape
   * with no compile error and no test failure.
   *
   * Contrast `cancelByUser` above, which unions (`$or`) on two handles instead.
   * That method is erasure and must over-match; this one is per-entity deletion
   * and must not under-match. Opposite directions, both deliberate — do not
   * normalise one to the other.
   */
  async cancelByConversationIds(
    conversationIds: string[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (conversationIds.length === 0) return ok(0);
    try {
      const result = await this.outboxModel.updateMany(
        {
          status: { $in: [OutboxStatus.PENDING, OutboxStatus.PROCESSING] },
          'payload.conversationId': { $in: conversationIds },
        },
        { $set: { status: OutboxStatus.FAILED, lastError: 'Entity deleted' } },
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to cancel outbox entries for conversations', error);
      return err({
        code: 'DB_ERROR',
        message: 'Failed to cancel outbox entries for conversations',
      });
    }
  }
}
