import { SessionRevokedReason } from '@acme/shared';
import { DBError, Result } from '../common/utils/result.util';
import { SessionRecord } from './schemas/session.schema';

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface CreateSessionInput {
  userId: string;
  deviceId: string;
  deviceName: string;
  refreshTokenHash: string;
  refreshTokenFamily: string;
  expiresAt: Date;
}

export interface SessionRevocationStatus {
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

export interface ISessionRepository {
  create(input: CreateSessionInput): Promise<Result<SessionRecord, DBError>>;
  findById(sessionId: string): Promise<Result<SessionRecord | null, DBError>>;
  findByXid(xid: string): Promise<Result<SessionRecord | null, DBError>>;
  findRevocationStatus(
    sessionId: string
  ): Promise<Result<SessionRevocationStatus | null, DBError>>;
  findActiveByRefreshHash(hash: string): Promise<Result<SessionRecord | null, DBError>>;
  findByPreviousHash(hash: string): Promise<Result<SessionRecord | null, DBError>>;
  findActiveByUserAndDevice(
    userId: string,
    deviceId: string
  ): Promise<Result<SessionRecord | null, DBError>>;
  listActiveByUser(userId: string): Promise<Result<SessionRecord[], DBError>>;
  rotate(
    sessionId: string,
    expectedOldHash: string,
    newHash: string
  ): Promise<Result<SessionRecord, DBError>>;
  revoke(sessionId: string, reason: SessionRevokedReason): Promise<Result<void, DBError>>;
  /**
   * Atomic: revokes every active session matching (userId, deviceId) in one
   * updateMany. Used on login to supersede any prior session on the same
   * device without a read-then-write race.
   */
  revokeActiveByUserAndDevice(
    userId: string,
    deviceId: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>>;
  /**
   * Atomic ownership-checked revoke. Returns `true` if the session was
   * revoked (matched xid + userId + still active), `false` otherwise.
   * Saves a read-then-write round-trip for the common case.
   */
  revokeOwnedByUserXid(
    sessionXid: string,
    userId: string,
    reason: SessionRevokedReason
  ): Promise<Result<boolean, DBError>>;
  revokeAllByUser(
    userId: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>>;
  revokeFamily(
    family: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>>;
}
