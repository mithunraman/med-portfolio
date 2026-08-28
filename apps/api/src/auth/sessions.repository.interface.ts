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

/**
 * Revocation comes in two kinds, and the split is deliberate.
 *
 * Every USER-INITIATED revocation is owner-scoped: `revokeOwnedBySessionId`
 * (logout, guest claim), `revokeOwnedByUserXid` (sign out a device),
 * `revokeActiveByUserAndDevice`, `revokeAllByUser`, `revokeFamily`. Their reason
 * codes are LOGOUT / LOGOUT_ALL / SUPERSEDED / ROTATION_REPLAY.
 *
 * Exactly one is not: `revokeIgnoringOwner`, used when the system does not trust
 * the session at all. See its docblock.
 */
export interface ISessionRepository {
  create(input: CreateSessionInput): Promise<Result<SessionRecord, DBError>>;
  /**
   * Returns `userId` ALONGSIDE the revocation state rather than filtering on it,
   * on purpose: `JwtStrategy` compares it against the token's `sub` to detect a
   * validly-signed token pointing at someone else's session. Scoping this query
   * by userId would collapse "wrong owner" into "not found" and delete that
   * forgery check — see the note on `revokeIgnoringOwner`.
   */
  findRevocationStatus(
    sessionId: string
  ): Promise<Result<SessionRevocationStatus | null, DBError>>;
  /**
   * Pre-authentication lookups: the caller holds a refresh token and nothing
   * else. Discovering WHOSE session it is *is* the purpose, so there is no owner
   * to scope by — `userId` is the output, not an input.
   */
  findActiveByRefreshHash(hash: string): Promise<Result<SessionRecord | null, DBError>>;
  findByPreviousHash(hash: string): Promise<Result<SessionRecord | null, DBError>>;
  listActiveByUser(userId: string): Promise<Result<SessionRecord[], DBError>>;
  /**
   * Takes no `userId` by design, and does not need one: the filter pins
   * `refreshTokenHash` to `expectedOldHash`, which is unique on the schema and
   * derived from the raw refresh token. A caller cannot reach this method without
   * already holding the session's live credential — a stronger proof of ownership
   * than a userId predicate, which only asserts a claim.
   */
  rotate(
    sessionId: string,
    expectedOldHash: string,
    newHash: string
  ): Promise<Result<SessionRecord, DBError>>;
  /**
   * The owner ends their own session. Returns `true` if a session was revoked
   * (matched sessionId + userId + still active), `false` otherwise — callers that
   * want idempotence, such as logout, may ignore it.
   */
  revokeOwnedBySessionId(
    sessionId: string,
    userId: string,
    reason: SessionRevokedReason
  ): Promise<Result<boolean, DBError>>;
  /**
   * ⚠️ Revokes a session REGARDLESS of who owns it.
   *
   * Exists for one caller: `JwtStrategy`, when a validly-signed token's `sub`
   * disagrees with the session's `userId`. That mismatch is the forgery signal,
   * so neither available userId can be used to scope the write — the token's
   * `sub` would never match and the revoke would silently no-op precisely when it
   * matters, while the session's own `userId`, read from the document about to be
   * updated, would be tautological.
   *
   * Any other caller wants `revokeOwnedBySessionId`.
   */
  revokeIgnoringOwner(
    sessionId: string,
    reason: SessionRevokedReason
  ): Promise<Result<void, DBError>>;
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
  /**
   * Revokes a whole refresh-token family on replay detection.
   *
   * Owner-scoped even though a family belongs to one user by construction —
   * `generateFamily()` is a per-login UUID and `rotate` never rewrites it. The
   * predicate can therefore only ever bind if that invariant breaks, which is
   * exactly why it is here: `refreshTokenFamily` is neither unique nor
   * user-scoped on the schema, so without it a collision would cascade across
   * accounts.
   */
  revokeFamily(
    family: string,
    userId: string,
    reason: SessionRevokedReason
  ): Promise<Result<number, DBError>>;
}
