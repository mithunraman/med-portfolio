import { SessionRevokedReason } from '@acme/shared';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import {
  Exemption,
  OWNER_SEED_COUNT,
  OwnershipContext,
  STRANGER_SEED_COUNT,
  describeOwnershipSuite,
  ownershipSpecFactory,
} from '../../common/testing/ownership-harness';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { isOk } from '../../common/utils/result.util';
import { SessionsRepository } from '../sessions.repository';
import { SESSION_REPOSITORY } from '../sessions.repository.interface';
import { Session, SessionDocument, SessionSchema } from '../schemas/session.schema';

/**
 * Generated ownership + blast-radius coverage for SessionsRepository.
 *
 * A defect here is not a data leak but an auth failure: a wrong filter hands a
 * refresh token to the wrong user, or lets a compromised session survive logout.
 * It is also the control that makes every other ownership check meaningful — if
 * sessions is wrong, nothing downstream matters.
 *
 * Two things distinguish it from the six repositories already covered:
 *
 * - **The owner is a `string`, not an ObjectId.** First real exercise of the
 *   harness's parameterised owner type.
 * - **Half the methods are exempt, and four of those are exempt for SECURITY
 *   reasons rather than "no owner available".** `findRevocationStatus` and
 *   `revokeIgnoringOwner` must NOT be scoped: the caller's purpose is to detect
 *   an owner mismatch, and scoping would collapse "wrong owner" into "not found".
 *   That makes this file's exemption block the most load-bearing one in the repo —
 *   it records a deliberate exception to the rule the harness enforces.
 *
 * Blast-radius cases for `rotate` and `revokeIgnoringOwner`, which the harness
 * cannot express, live in `sessions.repository.integration.spec.ts` (U-SR-13).
 */

const OWNER = new Types.ObjectId().toString();
const STRANGER = new Types.ObjectId().toString();

// Assigned in setup; the seed builder only ever runs inside a test.
let sessionModel: Model<SessionDocument>;

interface SeededSession {
  id: string;
  xid: string;
  deviceId: string;
  family: string;
}

/**
 * Built through the model rather than through `repo.create()`: a fixture must not
 * depend on the code under test being correct.
 *
 * Every field a spec keys on is unique per seed, and all three matter:
 *
 * - `refreshTokenHash` is `unique` on the schema — a shared value fails the
 *   insert rather than testing anything.
 * - `deviceId` and `refreshTokenFamily` are the record keys for
 *   `revokeActiveByUserAndDevice` and `revokeFamily`; sharing either would make
 *   one call hit several seeds and the count assertions meaningless.
 * - `expiresAt` must be in the FUTURE or `listActiveByUser` returns nothing and
 *   passes without asserting anything.
 */
async function seedSession(owner: string): Promise<SeededSession> {
  const suffix = nanoidAlphanumeric();

  const [doc] = await sessionModel.create([
    {
      userId: new Types.ObjectId(owner),
      deviceId: `device_${suffix}`,
      deviceName: 'Apple iPhone 15',
      refreshTokenHash: `hash_${suffix}`,
      refreshTokenFamily: `family_${suffix}`,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  ]);

  return {
    id: doc._id.toString(),
    xid: doc.xid,
    deviceId: doc.deviceId,
    family: doc.refreshTokenFamily,
  };
}

const spec = ownershipSpecFactory<SessionsRepository, string>();

const SPECS = [
  // ─── record axis: a record key plus the caller ───
  spec({
    method: 'revokeOwnedBySessionId',
    axis: 'record',
    mutates: true,
    seed: seedSession,
    call: (repo, target, caller) =>
      repo.revokeOwnedBySessionId(target.id, caller, SessionRevokedReason.LOGOUT),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: true }),
    // `false`, not an error: the caller cannot distinguish "no such session" from
    // "not yours", which is the right shape for a logout response.
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: false }),
  }),
  spec({
    method: 'revokeOwnedByUserXid',
    axis: 'record',
    mutates: true,
    seed: seedSession,
    call: (repo, target, caller) =>
      repo.revokeOwnedByUserXid(target.xid, caller, SessionRevokedReason.LOGOUT),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: true }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: false }),
  }),
  spec({
    // Scoped in Phase 1. A family belongs to one user by construction, so the
    // predicate drops nothing today — it bounds a collision, which is why the
    // cross-user case lives in U-SR-07 as well.
    method: 'revokeFamily',
    axis: 'record',
    mutates: true,
    seed: seedSession,
    call: (repo, target, caller) =>
      repo.revokeFamily(target.family, caller, SessionRevokedReason.ROTATION_REPLAY),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),
  spec({
    // Record-keyed on deviceId, not owner-axis: a foreign caller presenting the
    // owner's device must revoke nothing. Treating it as owner-axis would assert
    // far less.
    method: 'revokeActiveByUserAndDevice',
    axis: 'record',
    mutates: true,
    seed: seedSession,
    call: (repo, target, caller) =>
      repo.revokeActiveByUserAndDevice(caller, target.deviceId, SessionRevokedReason.SUPERSEDED),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),

  // ─── owner axis: keyed by the owner alone ───
  spec({
    method: 'listActiveByUser',
    axis: 'owner',
    mutates: false,
    seed: seedSession,
    call: (repo, _target, caller) => repo.listActiveByUser(caller),
    assertOwnerResult: (result) => {
      const sessions = isOk(result) ? result.value : [];
      expect(sessions).toHaveLength(OWNER_SEED_COUNT);
      expect(sessions.every((s) => s.userId === OWNER)).toBe(true);
    },
    assertForeignResult: (result) => {
      const sessions = isOk(result) ? result.value : [];
      expect(sessions).toHaveLength(STRANGER_SEED_COUNT);
      expect(sessions.every((s) => s.userId === STRANGER)).toBe(true);
    },
  }),
  spec({
    method: 'revokeAllByUser',
    axis: 'owner',
    mutates: true,
    seed: seedSession,
    call: (repo, _target, caller) =>
      repo.revokeAllByUser(caller, SessionRevokedReason.LOGOUT_ALL),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: OWNER_SEED_COUNT }),
    assertForeignResult: (result) =>
      expect(result).toEqual({ ok: true, value: STRANGER_SEED_COUNT }),
  }),
];

const EXEMPT: Exemption[] = [
  {
    method: 'create',
    kind: 'payload-scoped',
    reason:
      'Insert only. The owner arrives in CreateSessionInput and is written to the new ' +
      'row; no filter is applied and no existing session is reachable. Duplicate ' +
      'protection comes from the unique index on refreshTokenHash, not a predicate.',
  },
  {
    method: 'findRevocationStatus',
    kind: 'guarded-otherwise',
    reason:
      'MUST NOT be owner-scoped. It returns userId alongside the revocation state so ' +
      'JwtStrategy can compare it against the token\'s `sub` and detect a validly-signed ' +
      'token pointing at someone else\'s session. Scoping the query would collapse ' +
      '"wrong owner" into "not found", and the forgery check would silently stop working. ' +
      'The ownership decision lives in the caller here on purpose.',
  },
  {
    method: 'findActiveByRefreshHash',
    kind: 'guarded-otherwise',
    reason:
      'Pre-authentication. The refresh endpoint holds a raw token and nothing else; ' +
      'discovering WHOSE session it is IS the lookup\'s purpose, so userId is the output ' +
      'rather than an input. Bounded by the unique index on refreshTokenHash — at most ' +
      'one session can match — plus `revokedAt: null`.',
  },
  {
    method: 'findByPreviousHash',
    kind: 'guarded-otherwise',
    reason:
      'Pre-authentication, same as above. Note it deliberately does NOT filter ' +
      '`revokedAt: null`: replay detection has to find sessions that are already revoked, ' +
      'which is how a stolen token replayed after the family was killed is still caught. ' +
      'The ABSENCE of that clause is load-bearing — see the TTL index note on the schema.',
  },
  {
    method: 'rotate',
    kind: 'guarded-otherwise',
    reason:
      'Takes no userId and does not need one. The filter pins refreshTokenHash to ' +
      'expectedOldHash, which is unique on the schema and derived from the raw refresh ' +
      'token — so a caller cannot reach this method without already holding the session\'s ' +
      'live credential. That is a STRONGER proof of ownership than a userId predicate, ' +
      'which only asserts a claim. Blast radius covered by U-SR-13.',
  },
  {
    method: 'revokeIgnoringOwner',
    kind: 'guarded-otherwise',
    reason:
      'MUST NOT be owner-scoped, and named to say so. Used only by JwtStrategy when a ' +
      'token\'s `sub` disagrees with the session\'s userId. Scoping by that `sub` would ' +
      'never match, no-opping the revoke exactly when a forged token is detected; scoping ' +
      'by the session\'s own userId, read from the document about to be updated, would be ' +
      'tautological. Blast radius covered by U-SR-13.',
  },
];

describeOwnershipSuite<SessionsRepository, string>({
  name: 'SessionsRepository',
  repoClass: SessionsRepository,
  owner: OWNER,
  stranger: STRANGER,
  specs: SPECS,
  exempt: EXEMPT,
  setup: async (): Promise<OwnershipContext<SessionsRepository>> => {
    const mongod = await MongoMemoryServer.create();
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }]),
      ],
      providers: [{ provide: SESSION_REPOSITORY, useClass: SessionsRepository }],
    }).compile();

    await module.init();
    sessionModel = module.get<Model<SessionDocument>>(getModelToken(Session.name));
    // refreshTokenHash and xid are unique; build the indexes before the first
    // seed rather than relying on lazy autoIndex timing.
    await sessionModel.syncIndexes();

    return {
      repo: module.get(SESSION_REPOSITORY),
      connection: module.get<Connection>(getConnectionToken()),
      teardown: async () => {
        await module.close();
        await mongod.stop();
      },
    };
  },
});
