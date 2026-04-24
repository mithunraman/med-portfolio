import { SessionRevokedReason } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import { Session, SessionDocument } from './schemas/session.schema';
import { CreateSessionInput, ISessionRepository } from './sessions.repository.interface';

const PREVIOUS_HASHES_CAP = 10;

@Injectable()
export class SessionsRepository implements ISessionRepository {
  private readonly logger = new Logger(SessionsRepository.name);

  constructor(
    @InjectModel(Session.name)
    private sessionModel: Model<SessionDocument>
  ) {}

  async create(input: CreateSessionInput): Promise<Result<Session, DBError>> {
    try {
      const session = await this.sessionModel.create({
        userId: new Types.ObjectId(input.userId),
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        refreshTokenHash: input.refreshTokenHash,
        refreshTokenFamily: input.refreshTokenFamily,
        expiresAt: input.expiresAt,
      });
      return ok(session.toObject());
    } catch (error) {
      this.logger.error('Failed to create session', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create session' });
    }
  }

  async findById(sessionId: string): Promise<Result<Session | null, DBError>> {
    try {
      if (!Types.ObjectId.isValid(sessionId)) return ok(null);
      const session = await this.sessionModel.findById(sessionId).lean();
      return ok(session);
    } catch (error) {
      this.logger.error('Failed to find session by id', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find session' });
    }
  }

  async findActiveByRefreshHash(hash: string): Promise<Result<Session | null, DBError>> {
    try {
      const session = await this.sessionModel
        .findOne({ refreshTokenHash: hash, revokedAt: null })
        .lean();
      return ok(session);
    } catch (error) {
      this.logger.error('Failed to find session by refresh hash', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find session' });
    }
  }

  async findByPreviousHash(hash: string): Promise<Result<Session | null, DBError>> {
    try {
      const session = await this.sessionModel.findOne({ previousHashes: hash }).lean();
      return ok(session);
    } catch (error) {
      this.logger.error('Failed to find session by previous hash', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find session' });
    }
  }

  async findActiveByUserAndDevice(
    userId: string,
    deviceId: string
  ): Promise<Result<Session | null, DBError>> {
    try {
      const session = await this.sessionModel
        .findOne({
          userId: new Types.ObjectId(userId),
          deviceId,
          revokedAt: null,
        })
        .lean();
      return ok(session);
    } catch (error) {
      this.logger.error('Failed to find active session by user+device', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find session' });
    }
  }

  async listActiveByUser(userId: string): Promise<Result<Session[], DBError>> {
    try {
      const sessions = await this.sessionModel
        .find({
          userId: new Types.ObjectId(userId),
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        })
        .sort({ lastUsedAt: -1 })
        .lean();
      return ok(sessions);
    } catch (error) {
      this.logger.error('Failed to list active sessions', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list sessions' });
    }
  }

  async rotate(
    sessionId: string,
    expectedOldHash: string,
    newHash: string
  ): Promise<Result<Session, DBError>> {
    try {
      if (!Types.ObjectId.isValid(sessionId)) {
        return err({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      // Atomic compare-and-set: only rotate if refreshTokenHash still matches
      // the token the caller presented. Two concurrent rotations of the same
      // token will race here — one wins, the other's predicate misses.
      const updated = await this.sessionModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(sessionId),
            refreshTokenHash: expectedOldHash,
            revokedAt: null,
          },
          [
            {
              $set: {
                refreshTokenHash: newHash,
                previousHashes: {
                  $slice: [
                    { $concatArrays: [['$refreshTokenHash'], { $ifNull: ['$previousHashes', []] }] },
                    PREVIOUS_HASHES_CAP,
                  ],
                },
                lastUsedAt: new Date(),
              },
            },
          ],
          { new: true }
        )
        .lean();

      if (!updated) {
        return err({ code: 'NOT_FOUND', message: 'Session not found or already rotated' });
      }
      return ok(updated);
    } catch (error) {
      this.logger.error('Failed to rotate session', error);
      return err({ code: 'DB_ERROR', message: 'Failed to rotate session' });
    }
  }

  async revoke(
    sessionId: string,
    reason: SessionRevokedReason
  ): Promise<Result<void, DBError>> {
    try {
      await this.sessionModel.updateOne(
        { _id: new Types.ObjectId(sessionId), revokedAt: null },
        { revokedAt: new Date(), revokedReason: reason }
      );
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to revoke session', error);
      return err({ code: 'DB_ERROR', message: 'Failed to revoke session' });
    }
  }

  async revokeAllByUser(
    userId: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>> {
    try {
      const result = await this.sessionModel.updateMany(
        { userId: new Types.ObjectId(userId), revokedAt: null },
        { revokedAt: new Date(), revokedReason: reason }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to revoke user sessions', error);
      return err({ code: 'DB_ERROR', message: 'Failed to revoke sessions' });
    }
  }

  async revokeFamily(
    family: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>> {
    try {
      const result = await this.sessionModel.updateMany(
        { refreshTokenFamily: family, revokedAt: null },
        { revokedAt: new Date(), revokedReason: reason }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to revoke session family', error);
      return err({ code: 'DB_ERROR', message: 'Failed to revoke session family' });
    }
  }
}
