import { AuthErrorCode, SessionRevokedReason } from '@acme/shared';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  AuthTestHarness,
  cleanupAuthCollections,
  createAuthHarness,
  DEVICE_HEADERS,
  destroyAuthHarness,
  deviceHeadersFor,
  extractDevOtp,
  loginWithOtp,
} from './helpers/auth-test-harness';

jest.setTimeout(45000);

function loginFlow(
  harness: AuthTestHarness,
  email: string,
  device: Record<string, string> = DEVICE_HEADERS,
  name = 'Test User'
) {
  return loginWithOtp(harness, { email, device, name });
}

describe('Auth end-to-end flows', () => {
  let harness: AuthTestHarness;

  beforeAll(async () => {
    harness = await createAuthHarness();
  });

  afterAll(async () => {
    await destroyAuthHarness(harness);
  });

  beforeEach(async () => {
    await cleanupAuthCollections(harness);
    jest.clearAllMocks();
  });

  // ── I-FL-01 ──
  it('OTP → verify → authenticated /auth/me', async () => {
    const { accessToken, userId } = await loginFlow(harness, 'user1@example.com');

    const me = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(me.body.id).toBe(userId);
    expect(me.body.email).toBe('user1@example.com');

    const session = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    expect(session).not.toBeNull();
    expect(session!.deviceId).toBe(DEVICE_HEADERS['x-device-id']);
  });

  // ── I-FL-02 ──
  it('rotation loop: login → refresh → access new token', async () => {
    const { refreshToken, userId } = await loginFlow(harness, 'user2@example.com');

    const refreshRes = await request(harness.app.getHttpServer())
      .post('/api/auth/refresh')
      .set(DEVICE_HEADERS)
      .send({ refreshToken })
      .expect(200);

    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();
    expect(refreshRes.body.refreshToken).not.toBe(refreshToken);

    const session = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    expect(session!.previousHashes.length).toBe(1);

    await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.accessToken}`)
      .expect(200);
  });

  // ── I-FL-03 ──
  it('replay detection: using an old refresh token revokes the whole family', async () => {
    const { refreshToken: r1, userId } = await loginFlow(harness, 'replay@example.com');

    // Rotate once → r2
    const r2Res = await request(harness.app.getHttpServer())
      .post('/api/auth/refresh')
      .set(DEVICE_HEADERS)
      .send({ refreshToken: r1 })
      .expect(200);

    // Use r1 again → replay (distinct error code)
    const replayRes = await request(harness.app.getHttpServer())
      .post('/api/auth/refresh')
      .set(DEVICE_HEADERS)
      .send({ refreshToken: r1 })
      .expect(401);
    expect(replayRes.body.code).toBe(AuthErrorCode.REFRESH_REPLAY);

    const session = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    expect(session!.revokedAt).not.toBeNull();
    expect(session!.revokedReason).toBe(SessionRevokedReason.ROTATION_REPLAY);

    // Using r2 now also fails — family is dead
    const r2FollowUp = await request(harness.app.getHttpServer())
      .post('/api/auth/refresh')
      .set(DEVICE_HEADERS)
      .send({ refreshToken: r2Res.body.refreshToken })
      .expect(401);
    expect(r2FollowUp.body.code).toBe(AuthErrorCode.REFRESH_INVALID);
  });

  // ── I-FL-04 ──
  it('re-login on the same device supersedes the prior session', async () => {
    const first = await loginFlow(harness, 'same-device@example.com');
    const firstSessionId = first.userId; // will lookup below

    const sessionBefore = await harness.sessionModel.findOne({});
    expect(sessionBefore!.revokedAt).toBeNull();

    const second = await loginFlow(harness, 'same-device@example.com');
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const prior = await harness.sessionModel.findById(sessionBefore!._id).lean();
    expect(prior!.revokedAt).not.toBeNull();
    expect(prior!.revokedReason).toBe(SessionRevokedReason.SUPERSEDED);

    const active = await harness.sessionModel.findOne({ revokedAt: null });
    expect(active).not.toBeNull();
    expect(active!._id.toString()).not.toBe(sessionBefore!._id.toString());
    void firstSessionId;
  });

  // ── I-FL-05 ──
  it('login on a second device creates an independent session', async () => {
    const email = 'multi-device@example.com';
    const first = await loginFlow(harness, email, DEVICE_HEADERS);
    const secondHeaders = deviceHeadersFor('device-uuid-BBBB');
    const second = await loginFlow(harness, email, secondHeaders);

    const sessions = await harness.sessionModel.find({ revokedAt: null }).lean();
    expect(sessions).toHaveLength(2);

    // Both access tokens work
    await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);
    await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);

    const listRes = await request(harness.app.getHttpServer())
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);
    expect(listRes.body).toHaveLength(2);
  });

  // ── I-FL-06 ──
  it('access token is rejected immediately after logout (session revoked)', async () => {
    const { accessToken } = await loginFlow(harness, 'logout@example.com');

    await request(harness.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const meRes = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    expect(meRes.body.code).toBe(AuthErrorCode.SESSION_REVOKED);
  });

  // ── I-FL-07 ──
  it('logout-all revokes every active session for the user', async () => {
    const email = 'logout-all@example.com';
    const d1 = DEVICE_HEADERS;
    const d2 = deviceHeadersFor('device-uuid-2222');
    const d3 = deviceHeadersFor('device-uuid-3333');

    const s1 = await loginFlow(harness, email, d1);
    const s2 = await loginFlow(harness, email, d2);
    const s3 = await loginFlow(harness, email, d3);

    await request(harness.app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${s2.accessToken}`)
      .expect(200);

    for (const token of [s1.accessToken, s2.accessToken, s3.accessToken]) {
      const r = await request(harness.app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect(r.body.code).toBe(AuthErrorCode.SESSION_REVOKED);
    }

    const sessions = await harness.sessionModel.find({}).lean();
    for (const session of sessions) {
      expect(session.revokedAt).not.toBeNull();
      expect(session.revokedReason).toBe(SessionRevokedReason.LOGOUT_ALL);
    }
  });

  // ── I-FL-08 ──
  it('access rejected when session.expiresAt is in the past', async () => {
    const { accessToken, userId } = await loginFlow(harness, 'expired@example.com');

    await harness.sessionModel.updateOne(
      { userId: new Types.ObjectId(userId) },
      { expiresAt: new Date(Date.now() - 1000) }
    );

    const res = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    expect(res.body.code).toBe(AuthErrorCode.SESSION_EXPIRED);
  });

  // ── I-FL-09 ──
  it('refresh rejected when session.expiresAt is in the past', async () => {
    const { refreshToken, userId } = await loginFlow(harness, 'expired-r@example.com');

    await harness.sessionModel.updateOne(
      { userId: new Types.ObjectId(userId) },
      { expiresAt: new Date(Date.now() - 1000) }
    );

    const res = await request(harness.app.getHttpServer())
      .post('/api/auth/refresh')
      .set(DEVICE_HEADERS)
      .send({ refreshToken })
      .expect(401);
    expect(res.body.code).toBe(AuthErrorCode.SESSION_EXPIRED);

    const session = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    // No rotation happened
    expect(session!.previousHashes).toHaveLength(0);
  });

  // ── I-FL-10 ──
  it('OTP verify is rejected when x-device-id header is missing', async () => {
    const sendRes = await request(harness.app.getHttpServer())
      .post('/api/auth/otp/send')
      .send({ email: 'no-device@example.com' })
      .expect(200);
    const code = extractDevOtp(sendRes.body);

    const res = await request(harness.app.getHttpServer())
      .post('/api/auth/otp/verify')
      .send({ email: 'no-device@example.com', code });
    expect(res.status).toBe(400);
  });

  // ── I-FL-11 ──
  it('refresh endpoint is public — no Authorization header required', async () => {
    const { refreshToken } = await loginFlow(harness, 'public-refresh@example.com');

    const res = await request(harness.app.getHttpServer())
      .post('/api/auth/refresh')
      .set(DEVICE_HEADERS)
      .send({ refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });
});
