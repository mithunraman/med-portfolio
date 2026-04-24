import { SessionRevokedReason, UserRole } from '@acme/shared';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  AuthTestHarness,
  cleanupAuthCollections,
  createAuthHarness,
  DEVICE_HEADERS,
  destroyAuthHarness,
  extractDevOtp,
} from './helpers/auth-test-harness';

jest.setTimeout(45000);

async function registerGuest(harness: AuthTestHarness, headers = DEVICE_HEADERS) {
  const res = await request(harness.app.getHttpServer())
    .post('/api/auth/guest')
    .set(headers)
    .send({})
    .expect(201);
  return {
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
    userId: res.body.user.id as string,
    role: res.body.user.role as number,
  };
}

async function sendOtp(harness: AuthTestHarness, email: string): Promise<string> {
  const res = await request(harness.app.getHttpServer())
    .post('/api/auth/otp/send')
    .send({ email })
    .expect(200);
  return extractDevOtp(res.body);
}

describe('Guest flows', () => {
  let harness: AuthTestHarness;

  beforeAll(async () => {
    harness = await createAuthHarness();
  });

  afterAll(async () => {
    await destroyAuthHarness(harness);
  });

  beforeEach(async () => {
    await cleanupAuthCollections(harness);
  });

  // ── I-GU-01 ──
  it('guest registration issues access + refresh tokens and a session', async () => {
    const guest = await registerGuest(harness);

    expect(guest.accessToken).toBeDefined();
    expect(guest.refreshToken).toBeDefined();
    expect(guest.role).toBe(UserRole.USER_GUEST);

    const session = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(guest.userId),
    });
    expect(session).not.toBeNull();
    expect(session!.refreshTokenFamily).toBeTruthy();
  });

  // ── I-GU-02 ──
  it('a guest can refresh their tokens (rotation parity with real users)', async () => {
    const guest = await registerGuest(harness);

    const rotated = await request(harness.app.getHttpServer())
      .post('/api/auth/refresh')
      .set(DEVICE_HEADERS)
      .send({ refreshToken: guest.refreshToken })
      .expect(200);

    expect(rotated.body.refreshToken).not.toBe(guest.refreshToken);
    // Access tokens may be byte-identical if minted in the same clock second
    // (HS256 + same payload + same iat → same signature). The contract tested
    // here is that the refresh rotated and the new access token still works.
    await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(200);

    const session = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(guest.userId),
    });
    expect(session!.previousHashes.length).toBe(1);
  });

  // ── I-GU-03 ──
  it('claim upgrades in-place, revokes the guest session, issues a new session for the same _id', async () => {
    const guest = await registerGuest(harness);

    const email = 'claimed@example.com';
    const code = await sendOtp(harness, email);

    const claimRes = await request(harness.app.getHttpServer())
      .post('/api/auth/claim')
      .set(DEVICE_HEADERS)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({ email, code, name: 'Real Person' })
      .expect(200);

    expect(claimRes.body.accessToken).toBeDefined();
    expect(claimRes.body.refreshToken).toBeDefined();
    expect(claimRes.body.user.id).toBe(guest.userId); // same _id!
    expect(claimRes.body.user.role).toBe(UserRole.USER);
    expect(claimRes.body.user.email).toBe(email);

    const sessions = await harness.sessionModel
      .find({ userId: new Types.ObjectId(guest.userId) })
      .lean();
    const revoked = sessions.find((s) => s.revokedAt !== null);
    const active = sessions.find((s) => s.revokedAt === null);
    expect(revoked).toBeDefined();
    expect(revoked!.revokedReason).toBe(SessionRevokedReason.SUPERSEDED);
    expect(active).toBeDefined();
  });

  // ── I-GU-04 ──
  it('claim fails when the email already belongs to another user (no side effects)', async () => {
    // Pre-existing real user with the target email
    await request(harness.app.getHttpServer())
      .post('/api/auth/otp/send')
      .send({ email: 'taken@example.com' })
      .expect(200);
    const takenCode = await sendOtp(harness, 'taken@example.com');
    await request(harness.app.getHttpServer())
      .post('/api/auth/otp/verify')
      .set({ ...DEVICE_HEADERS, 'x-device-id': 'other-device' })
      .send({ email: 'taken@example.com', code: takenCode, name: 'Already Here' })
      .expect(200);

    // Now make a guest and try to claim with the taken email
    const guest = await registerGuest(harness);
    const guestCode = await sendOtp(harness, 'taken@example.com');

    await request(harness.app.getHttpServer())
      .post('/api/auth/claim')
      .set(DEVICE_HEADERS)
      .set('Authorization', `Bearer ${guest.accessToken}`)
      .send({ email: 'taken@example.com', code: guestCode, name: 'Imposter' })
      .expect(409);

    // Guest still a guest, guest session still active
    const guestDoc = await harness.userModel.findById(guest.userId).lean();
    expect(guestDoc!.role).toBe(UserRole.USER_GUEST);

    const guestSession = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(guest.userId),
      revokedAt: null,
    });
    expect(guestSession).not.toBeNull();
  });

  // ── I-GU-05 ──
  it('claim fails when caller is already a real user', async () => {
    const email = 'already-user@example.com';
    const code = await sendOtp(harness, email);
    const real = await request(harness.app.getHttpServer())
      .post('/api/auth/otp/verify')
      .set(DEVICE_HEADERS)
      .send({ email, code, name: 'Real' })
      .expect(200);

    const newEmail = 'wont-work@example.com';
    const newCode = await sendOtp(harness, newEmail);

    await request(harness.app.getHttpServer())
      .post('/api/auth/claim')
      .set(DEVICE_HEADERS)
      .set('Authorization', `Bearer ${real.body.accessToken}`)
      .send({ email: newEmail, code: newCode, name: 'Nope' })
      .expect(400);
  });
});
