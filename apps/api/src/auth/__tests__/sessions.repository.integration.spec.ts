import { SessionRevokedReason } from '@acme/shared';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Model, Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { diffSnapshots, snapshotAll } from '../../common/testing/blast-radius';
import { isErr, isOk } from '../../common/utils/result.util';
import { Session, SessionDocument, SessionSchema } from '../schemas/session.schema';
import { SessionsRepository } from '../sessions.repository';

jest.setTimeout(30000);

function makeInput(overrides: Partial<Parameters<SessionsRepository['create']>[0]> = {}) {
  return {
    userId: new Types.ObjectId().toString(),
    deviceId: 'device-uuid',
    deviceName: 'iOS iPhone 15',
    refreshTokenHash: 'hash-' + Math.random().toString(36).slice(2),
    refreshTokenFamily: 'fam-' + Math.random().toString(36).slice(2),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe('SessionsRepository (integration)', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let repo: SessionsRepository;
  let model: Model<SessionDocument>;
  let connection: Connection;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }]),
      ],
      providers: [SessionsRepository],
    }).compile();

    await module.init();

    repo = module.get(SessionsRepository);
    model = module.get(getModelToken(Session.name));
    connection = module.get<Connection>(getConnectionToken());
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  describe('U-SR-01 create', () => {
    it('persists a session with default previousHashes:[] and revokedAt:null', async () => {
      const input = makeInput();
      const result = await repo.create(input);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.refreshTokenHash).toBe(input.refreshTokenHash);
      expect(result.value.previousHashes).toEqual([]);
      expect(result.value.revokedAt).toBeNull();
      expect(result.value.lastUsedAt).toBeInstanceOf(Date);
    });
  });

  describe('U-SR-02 findActiveByRefreshHash', () => {
    it('excludes revoked rows', async () => {
      const created = await repo.create(makeInput({ refreshTokenHash: 'H1' }));
      if (!isOk(created)) throw new Error('create failed');

      await repo.revokeOwnedBySessionId(
        created.value.id,
        created.value.userId,
        SessionRevokedReason.LOGOUT
      );

      const result = await repo.findActiveByRefreshHash('H1');
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBeNull();
    });

    it('returns the active session when hash matches', async () => {
      await repo.create(makeInput({ refreshTokenHash: 'H_active' }));

      const result = await repo.findActiveByRefreshHash('H_active');
      if (!isOk(result)) throw new Error('lookup failed');
      expect(result.value).not.toBeNull();
      expect(result.value!.refreshTokenHash).toBe('H_active');
    });
  });

  describe('U-SR-03 findByPreviousHash', () => {
    it('returns the owning session after rotation', async () => {
      const created = await repo.create(makeInput({ refreshTokenHash: 'H_orig' }));
      if (!isOk(created)) throw new Error('create failed');

      const rotated = await repo.rotate(created.value.id, 'H_orig', 'H_new');
      if (!isOk(rotated)) throw new Error('rotate failed');

      const result = await repo.findByPreviousHash('H_orig');
      if (!isOk(result)) throw new Error('lookup failed');
      expect(result.value).not.toBeNull();
      expect(result.value!.refreshTokenFamily).toBe(created.value.refreshTokenFamily);
    });
  });

  describe('U-SR-04 rotate', () => {
    it('moves current hash into previousHashes and updates lastUsedAt', async () => {
      const created = await repo.create(makeInput({ refreshTokenHash: 'H1' }));
      if (!isOk(created)) throw new Error('create failed');
      const before = created.value.lastUsedAt.getTime();

      // Nudge clock
      await new Promise((r) => setTimeout(r, 5));

      const rotated = await repo.rotate(created.value.id, 'H1', 'H2');
      if (!isOk(rotated)) throw new Error('rotate failed');

      expect(rotated.value.refreshTokenHash).toBe('H2');
      expect(rotated.value.previousHashes).toEqual(['H1']);
      expect(rotated.value.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('refuses to rotate when the expected old hash does not match (CAS)', async () => {
      const created = await repo.create(makeInput({ refreshTokenHash: 'H1' }));
      if (!isOk(created)) throw new Error('create failed');

      const result = await repo.rotate(created.value.id, 'H_wrong', 'H2');
      expect(result.ok).toBe(false);

      const doc = await model.findById(created.value.id).lean();
      expect(doc!.refreshTokenHash).toBe('H1'); // unchanged
    });

    it('is atomic under concurrent rotations of the same token', async () => {
      const created = await repo.create(makeInput({ refreshTokenHash: 'H1' }));
      if (!isOk(created)) throw new Error('create failed');
      const id = created.value.id;

      const [a, b] = await Promise.all([
        repo.rotate(id, 'H1', 'H2_a'),
        repo.rotate(id, 'H1', 'H2_b'),
      ]);

      const successes = [a, b].filter((r) => r.ok === true).length;
      const failures = [a, b].filter((r) => r.ok === false).length;
      expect(successes).toBe(1);
      expect(failures).toBe(1);

      const doc = await model.findById(id).lean();
      expect(['H2_a', 'H2_b']).toContain(doc!.refreshTokenHash);
      expect(doc!.previousHashes).toEqual(['H1']);
    });
  });

  describe('U-SR-05 rotate caps previousHashes at 10', () => {
    it('keeps only the 10 most recent previous hashes', async () => {
      const created = await repo.create(makeInput({ refreshTokenHash: 'H_0' }));
      if (!isOk(created)) throw new Error('create failed');
      const id = created.value.id;

      for (let i = 1; i <= 12; i++) {
        const r = await repo.rotate(id, `H_${i - 1}`, `H_${i}`);
        if (!isOk(r)) throw new Error(`rotate ${i} failed`);
      }

      const doc = await model.findById(id).lean();
      expect(doc!.previousHashes.length).toBe(10);
      expect(doc!.previousHashes[0]).toBe('H_11'); // most recent previous
      expect(doc!.previousHashes).not.toContain('H_0'); // oldest evicted
      expect(doc!.previousHashes).not.toContain('H_1');
      expect(doc!.refreshTokenHash).toBe('H_12');
    });
  });

  describe('U-SR-06 revokeOwnedBySessionId idempotency', () => {
    it('does not overwrite an existing revocation', async () => {
      const created = await repo.create(makeInput());
      if (!isOk(created)) throw new Error('create failed');
      const id = created.value.id;

      await repo.revokeOwnedBySessionId(id, created.value.userId, SessionRevokedReason.LOGOUT);
      const firstRev = await model.findById(id).lean();

      await new Promise((r) => setTimeout(r, 5));
      await repo.revokeOwnedBySessionId(
        id,
        created.value.userId,
        SessionRevokedReason.LOGOUT_ALL
      );
      const secondRev = await model.findById(id).lean();

      expect(secondRev!.revokedReason).toBe(SessionRevokedReason.LOGOUT);
      expect(secondRev!.revokedAt!.getTime()).toBe(firstRev!.revokedAt!.getTime());
    });
  });

  describe('U-SR-07 revokeFamily scope', () => {
    it('revokes only active rows in the target family', async () => {
      const userA = new Types.ObjectId().toString();
      // family F1: two rows — one active, one already revoked
      const f1active = await repo.create(
        makeInput({ userId: userA, refreshTokenFamily: 'F1', refreshTokenHash: 'F1-active' })
      );
      const f1revoked = await repo.create(
        makeInput({ userId: userA, refreshTokenFamily: 'F1', refreshTokenHash: 'F1-dead' })
      );
      // family F2: one active
      const f2active = await repo.create(
        makeInput({ userId: userA, refreshTokenFamily: 'F2', refreshTokenHash: 'F2-active' })
      );

      if (!isOk(f1active) || !isOk(f1revoked) || !isOk(f2active)) {
        throw new Error('seed failed');
      }

      await repo.revokeOwnedBySessionId(f1revoked.value.id, userA, SessionRevokedReason.LOGOUT);
      const preexistingRev = (await model.findById(f1revoked.value.id).lean())!.revokedAt!;

      const result = await repo.revokeFamily('F1', userA, SessionRevokedReason.ROTATION_REPLAY);
      if (!isOk(result)) throw new Error('revokeFamily failed');
      expect(result.value).toBe(1);

      const f1activeAfter = await model.findById(f1active.value.id).lean();
      const f1revokedAfter = await model.findById(f1revoked.value.id).lean();
      const f2activeAfter = await model.findById(f2active.value.id).lean();

      expect(f1activeAfter!.revokedAt).not.toBeNull();
      expect(f1activeAfter!.revokedReason).toBe(SessionRevokedReason.ROTATION_REPLAY);

      // Already-revoked row untouched
      expect(f1revokedAfter!.revokedReason).toBe(SessionRevokedReason.LOGOUT);
      expect(f1revokedAfter!.revokedAt!.getTime()).toBe(preexistingRev.getTime());

      // Other family untouched
      expect(f2activeAfter!.revokedAt).toBeNull();
    });

    it('does not revoke another user’s session that shares the family value', async () => {
      // Unreachable today: `generateFamily()` is a per-login UUID and `rotate`
      // never rewrites it, so a family belongs to one user by construction. But
      // `refreshTokenFamily` is neither unique nor user-scoped on the schema, so
      // nothing enforces that — and this method is the replay response, which
      // fires on a security event. The owner predicate is what stops a collision
      // cascading across accounts, and this is the case that proves it is there.
      const userA = new Types.ObjectId().toString();
      const userB = new Types.ObjectId().toString();

      const mine = await repo.create(
        makeInput({ userId: userA, refreshTokenFamily: 'SHARED', refreshTokenHash: 'a-shared' })
      );
      const theirs = await repo.create(
        makeInput({ userId: userB, refreshTokenFamily: 'SHARED', refreshTokenHash: 'b-shared' })
      );
      if (!isOk(mine) || !isOk(theirs)) throw new Error('seed failed');

      const result = await repo.revokeFamily(
        'SHARED',
        userA,
        SessionRevokedReason.ROTATION_REPLAY
      );
      if (!isOk(result)) throw new Error('revokeFamily failed');
      expect(result.value).toBe(1);

      expect((await model.findById(mine.value.id).lean())!.revokedAt).not.toBeNull();
      expect((await model.findById(theirs.value.id).lean())!.revokedAt).toBeNull();
    });
  });

  describe('U-SR-08 revokeAllByUser scope', () => {
    it('revokes only the target user\u2019s active sessions', async () => {
      const userA = new Types.ObjectId().toString();
      const userB = new Types.ObjectId().toString();

      const a1 = await repo.create(makeInput({ userId: userA, refreshTokenHash: 'a1' }));
      const a2 = await repo.create(makeInput({ userId: userA, refreshTokenHash: 'a2' }));
      const a3 = await repo.create(makeInput({ userId: userA, refreshTokenHash: 'a3' }));
      const b1 = await repo.create(makeInput({ userId: userB, refreshTokenHash: 'b1' }));

      if (!isOk(a3) || !isOk(b1) || !isOk(a1) || !isOk(a2)) throw new Error('seed failed');

      await repo.revokeOwnedBySessionId(a3.value.id, userA, SessionRevokedReason.LOGOUT); // already revoked

      const result = await repo.revokeAllByUser(userA, SessionRevokedReason.LOGOUT_ALL);
      if (!isOk(result)) throw new Error('revokeAllByUser failed');
      expect(result.value).toBe(2);

      const after = await model.find({}).lean();
      const byHash = Object.fromEntries(after.map((s) => [s.refreshTokenHash, s]));
      expect(byHash.a1.revokedAt).not.toBeNull();
      expect(byHash.a1.revokedReason).toBe(SessionRevokedReason.LOGOUT_ALL);
      expect(byHash.a2.revokedAt).not.toBeNull();
      expect(byHash.a3.revokedReason).toBe(SessionRevokedReason.LOGOUT); // untouched
      expect(byHash.b1.revokedAt).toBeNull();
    });
  });

  describe('U-SR-09 listActiveByUser', () => {
    it('excludes revoked and expired sessions', async () => {
      const user = new Types.ObjectId().toString();
      const active = await repo.create(makeInput({ userId: user, refreshTokenHash: 'alive' }));
      const revoked = await repo.create(makeInput({ userId: user, refreshTokenHash: 'dead' }));
      const expired = await repo.create(
        makeInput({
          userId: user,
          refreshTokenHash: 'expired',
          expiresAt: new Date(Date.now() - 1000),
        })
      );
      if (!isOk(active) || !isOk(revoked) || !isOk(expired)) throw new Error('seed failed');

      await repo.revokeOwnedBySessionId(revoked.value.id, user, SessionRevokedReason.LOGOUT);

      const result = await repo.listActiveByUser(user);
      if (!isOk(result)) throw new Error('list failed');
      expect(result.value.length).toBe(1);
      expect(result.value[0].refreshTokenHash).toBe('alive');
    });
  });

  describe('U-SR-11 session id input validation', () => {
    it('returns ok(false) for a malformed object id — does not throw', async () => {
      // A garbage session id in a token is "no session", not a 500. Both
      // id-taking revokes share `toObjectIdOrNull`, so this covers the parse.
      const result = await repo.revokeOwnedBySessionId(
        'not-an-objectid',
        new Types.ObjectId().toString(),
        SessionRevokedReason.LOGOUT
      );
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(false);
    });

    it('revokeIgnoringOwner tolerates a malformed object id too', async () => {
      const result = await repo.revokeIgnoringOwner(
        'not-an-objectid',
        SessionRevokedReason.SUSPICIOUS
      );
      expect(isOk(result)).toBe(true);
    });
  });

  // ─── U-SR-13 blast radius for the two methods that take no owner ───
  //
  // `rotate` and `revokeIgnoringOwner` are exempt from the generated ownership
  // suite for documented security reasons (see the exemption block in
  // sessions.repository.blast-radius.integration.spec.ts). Exempt from OWNERSHIP
  // is not exempt from "touched only what it should" — these cover that half.
  //
  // Reuses the harness's snapshot primitives rather than naming decoys: the
  // assertion is that the delta across the WHOLE database is exactly one
  // document, which also catches a write nobody thought to look for.

  describe('U-SR-13 blast radius', () => {
    /**
     * Seeds a session for each of two users. The target sits in the MIDDLE of the
     * owner's rows on purpose: a filter that loses its record predicate lands on
     * whichever row the planner reaches first or last, so a target at either end
     * could be hit correctly by accident. Same reasoning as the sibling placement
     * in `ownership-harness.ts`.
     */
    async function seedTrio(userA: string, userB: string) {
      const before = await repo.create(makeInput({ userId: userA, refreshTokenHash: 'H_before' }));
      const target = await repo.create(makeInput({ userId: userA, refreshTokenHash: 'H_target' }));
      const after = await repo.create(makeInput({ userId: userA, refreshTokenHash: 'H_after' }));
      const other = await repo.create(makeInput({ userId: userB, refreshTokenHash: 'H_other' }));
      if (!isOk(before) || !isOk(target) || !isOk(after) || !isOk(other)) {
        throw new Error('seed failed');
      }
      return { target: target.value, ids: [before.value.id, after.value.id, other.value.id] };
    }

    it('rotate touches exactly one session', async () => {
      const userA = new Types.ObjectId().toString();
      const userB = new Types.ObjectId().toString();
      const { target } = await seedTrio(userA, userB);

      const snapshot = await snapshotAll(connection);
      const result = await repo.rotate(target.id, 'H_target', 'H_rotated');
      if (!isOk(result)) throw new Error('rotate failed');
      const { touched } = diffSnapshots(snapshot, await snapshotAll(connection));

      expect(touched).toEqual([`sessions:${target.id}`]);
    });

    it('revokeIgnoringOwner revokes exactly one session', async () => {
      const userA = new Types.ObjectId().toString();
      const userB = new Types.ObjectId().toString();
      const { target } = await seedTrio(userA, userB);

      const snapshot = await snapshotAll(connection);
      const result = await repo.revokeIgnoringOwner(target.id, SessionRevokedReason.SUSPICIOUS);
      if (!isOk(result)) throw new Error('revokeIgnoringOwner failed');
      const { touched } = diffSnapshots(snapshot, await snapshotAll(connection));

      expect(touched).toEqual([`sessions:${target.id}`]);
    });

    it('revokeIgnoringOwner revokes a session belonging to someone else — by design', async () => {
      // The property that makes it dangerous is also the property JwtStrategy
      // needs: on a forged token the session's owner is NOT the caller, so a
      // scoped revoke would no-op precisely when it matters.
      const userA = new Types.ObjectId().toString();
      const userB = new Types.ObjectId().toString();
      const { target } = await seedTrio(userA, userB);

      await repo.revokeIgnoringOwner(target.id, SessionRevokedReason.SUSPICIOUS);

      const after = await model.findById(target.id).lean();
      expect(after!.revokedReason).toBe(SessionRevokedReason.SUSPICIOUS);
    });
  });

  describe('U-SR-12 error envelope on DB failure', () => {
    it('wraps thrown Mongoose errors as err({code:DB_ERROR})', async () => {
      const brokenModel = {
        create: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const brokenRepo = new SessionsRepository(brokenModel as any);

      const result = await brokenRepo.create(makeInput());
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('DB_ERROR');
    });
  });
});
