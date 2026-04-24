import { SessionRevokedReason } from '@acme/shared';
import { DBError, Result } from '../common/utils/result.util';
import { Session } from './schemas/session.schema';

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface CreateSessionInput {
  userId: string;
  deviceId: string;
  deviceName: string;
  refreshTokenHash: string;
  refreshTokenFamily: string;
  expiresAt: Date;
}

export interface ISessionRepository {
  create(input: CreateSessionInput): Promise<Result<Session, DBError>>;
  findById(sessionId: string): Promise<Result<Session | null, DBError>>;
  findActiveByRefreshHash(hash: string): Promise<Result<Session | null, DBError>>;
  findByPreviousHash(hash: string): Promise<Result<Session | null, DBError>>;
  findActiveByUserAndDevice(
    userId: string,
    deviceId: string
  ): Promise<Result<Session | null, DBError>>;
  listActiveByUser(userId: string): Promise<Result<Session[], DBError>>;
  rotate(
    sessionId: string,
    expectedOldHash: string,
    newHash: string
  ): Promise<Result<Session, DBError>>;
  revoke(sessionId: string, reason: SessionRevokedReason): Promise<Result<void, DBError>>;
  revokeAllByUser(
    userId: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>>;
  revokeFamily(
    family: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>>;
}
