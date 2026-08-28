import { SessionRevokedReason } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import { Session, SessionDocument, SessionRecord, toSessionRecord } from './schemas/session.schema';
import {
  CreateSessionInput,
  ISessionRepository,
  SessionRevocationStatus,
} from './sessions.repository.interface';

const PREVIOUS_HASHES_CAP = 10;
const MAX_ACTIVE_SESSIONS_RETURNED = 50;

function toObjectIdOrNull(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
}

@Injectable()
export class SessionsRepository implements ISessionRepository {
  private readonly logger = new Logger(SessionsRepository.name);

  constructor(
    @InjectModel(Session.name)
    private sessionModel: Model<SessionDocument>
  ) {}

  async create(input: CreateSessionInput): Promise<Result<SessionRecord, DBError>> {
    try {
      const session = await this.sessionModel.create({
        userId: new Types.ObjectId(input.userId),
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        refreshTokenHash: input.refreshTokenHash,
        refreshTokenFamily: input.refreshTokenFamily,
        expiresAt: input.expiresAt,
      });
      return ok(toSessionRecord(session.toObject()));
    } catch (error) {
      this.logger.error('Failed to create session', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create session' });
    }
  }

  async findRevocationStatus(
    sessionId: string
  ): Promise<Result<SessionRevocationStatus | null, DBError>> {
    try {
      const oid = toObjectIdOrNull(sessionId);
      if (!oid) return ok(null);
      const session = await this.sessionModel
        .findById(oid)
        .select('userId revokedAt expiresAt')
        .lean();
      if (!session) return ok(null);
      return ok({
        userId: session.userId.toString(),
        revokedAt: session.revokedAt,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      this.logger.error('Failed to find session revocation status', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find session' });
    }
  }

  async findActiveByRefreshHash(hash: string): Promise<Result<SessionRecord | null, DBError>> {
    try {
      const session = await this.sessionModel
        .findOne({ refreshTokenHash: hash, revokedAt: null })
        .lean();
      return ok(session ? toSessionRecord(session) : null);
    } catch (error) {
      this.logger.error('Failed to find session by refresh hash', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find session' });
    }
  }

  async findByPreviousHash(hash: string): Promise<Result<SessionRecord | null, DBError>> {
    try {
      const session = await this.sessionModel.findOne({ previousHashes: hash }).lean();
      return ok(session ? toSessionRecord(session) : null);
    } catch (error) {
      this.logger.error('Failed to find session by previous hash', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find session' });
    }
  }

  async listActiveByUser(userId: string): Promise<Result<SessionRecord[], DBError>> {
    try {
      const sessions = await this.sessionModel
        .find({
          userId: new Types.ObjectId(userId),
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        })
        .sort({ lastUsedAt: -1 })
        .limit(MAX_ACTIVE_SESSIONS_RETURNED)
        .lean();
      return ok(sessions.map(toSessionRecord));
    } catch (error) {
      this.logger.error('Failed to list active sessions', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list sessions' });
    }
  }

  async rotate(
    sessionId: string,
    expectedOldHash: string,
    newHash: string
  ): Promise<Result<SessionRecord, DBError>> {
    try {
      const oid = toObjectIdOrNull(sessionId);
      if (!oid) {
        return err({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      // Atomic compare-and-set: only rotate if refreshTokenHash still matches
      // the token the caller presented. Two concurrent rotations of the same
      // token will race here — one wins, the other's predicate misses.
      const updated = await this.sessionModel
        .findOneAndUpdate(
          {
            _id: oid,
            refreshTokenHash: expectedOldHash,
            revokedAt: null,
          },
          [
            {
              $set: {
                refreshTokenHash: newHash,
                previousHashes: {
                  $slice: [
                    {
                      $concatArrays: [['$refreshTokenHash'], { $ifNull: ['$previousHashes', []] }],
                    },
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
      return ok(toSessionRecord(updated));
    } catch (error) {
      this.logger.error('Failed to rotate session', error);
      return err({ code: 'DB_ERROR', message: 'Failed to rotate session' });
    }
  }

  async revokeOwnedBySessionId(
    sessionId: string,
    userId: string,
    reason: SessionRevokedReason
  ): Promise<Result<boolean, DBError>> {
    try {
      const oid = toObjectIdOrNull(sessionId);
      if (!oid) return ok(false);
      // Ownership predicate at the persistence layer — defence in depth. Callers
      // reach here with a sessionId from a verified JWT, which JwtStrategy has
      // already matched against the user; this covers the future caller that
      // sources it from somewhere else.
      const result = await this.sessionModel.updateOne(
        { _id: oid, userId: new Types.ObjectId(userId), revokedAt: null },
        { revokedAt: new Date(), revokedReason: reason }
      );
      return ok(result.modifiedCount === 1);
    } catch (error) {
      this.logger.error('Failed to revoke owned session', error);
      return err({ code: 'DB_ERROR', message: 'Failed to revoke session' });
    }
  }

  /** ⚠️ Unscoped by design — see the interface docblock before using this. */
  async revokeIgnoringOwner(
    sessionId: string,
    reason: SessionRevokedReason
  ): Promise<Result<void, DBError>> {
    try {
      const oid = toObjectIdOrNull(sessionId);
      if (!oid) return ok(undefined);
      await this.sessionModel.updateOne(
        { _id: oid, revokedAt: null },
        { revokedAt: new Date(), revokedReason: reason }
      );
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to revoke session', error);
      return err({ code: 'DB_ERROR', message: 'Failed to revoke session' });
    }
  }

  async revokeActiveByUserAndDevice(
    userId: string,
    deviceId: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>> {
    try {
      const result = await this.sessionModel.updateMany(
        { userId: new Types.ObjectId(userId), deviceId, revokedAt: null },
        { revokedAt: new Date(), revokedReason: reason }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to revoke sessions by user+device', error);
      return err({ code: 'DB_ERROR', message: 'Failed to revoke sessions' });
    }
  }

  async revokeOwnedByUserXid(
    sessionXid: string,
    userId: string,
    reason: SessionRevokedReason
  ): Promise<Result<boolean, DBError>> {
    try {
      const result = await this.sessionModel.updateOne(
        {
          xid: sessionXid,
          userId: new Types.ObjectId(userId),
          revokedAt: null,
        },
        { revokedAt: new Date(), revokedReason: reason }
      );
      return ok(result.modifiedCount === 1);
    } catch (error) {
      this.logger.error('Failed to revoke owned session', error);
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
    userId: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>> {
    try {
      // Ownership predicate at the persistence layer — defence in depth. A family
      // belongs to one user by construction (per-login UUID, never rewritten by
      // rotate), so this drops nothing today; it bounds the blast radius if that
      // ever stops holding, since refreshTokenFamily is not unique on the schema.
      const result = await this.sessionModel.updateMany(
        { refreshTokenFamily: family, userId: new Types.ObjectId(userId), revokedAt: null },
        { revokedAt: new Date(), revokedReason: reason }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to revoke session family', error);
      return err({ code: 'DB_ERROR', message: 'Failed to revoke session family' });
    }
  }
}
