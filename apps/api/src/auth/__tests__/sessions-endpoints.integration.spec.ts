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
} from './helpers/auth-test-harness';

jest.setTimeout(45000);

async function loginAs(
  harness: AuthTestHarness,
  email: string,
  headers = DEVICE_HEADERS,
  name = 'Test User'
) {
  const sendRes = await request(harness.app.getHttpServer())
    .post('/api/auth/otp/send')
    .send({ email })
    .expect(200);
  const code = extractDevOtp(sendRes.body);

  const verifyRes = await request(harness.app.getHttpServer())
    .post('/api/auth/otp/verify')
    .set(headers)
    .send({ email, code, name })
    .expect(200);

  return {
    accessToken: verifyRes.body.accessToken as string,
    refreshToken: verifyRes.body.refreshToken as string,
    userId: verifyRes.body.user.id as string,
  };
}

describe('Session management endpoints', () => {
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

  // ── I-SM-01 ──
  it('GET /auth/sessions returns only active sessions with correct isCurrent flag', async () => {
    const email = 'list@example.com';
    const first = await loginAs(harness, email, DEVICE_HEADERS);
    const second = await loginAs(harness, email, deviceHeadersFor('device-B'));
    const third = await loginAs(harness, email, deviceHeadersFor('device-C'));

    // Revoke one session via logout
    await request(harness.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${third.accessToken}`)
      .expect(200);

    const res = await request(harness.app.getHttpServer())
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    const currents = res.body.filter((s: { isCurrent: boolean }) => s.isCurrent);
    expect(currents).toHaveLength(1);
    void first;
  });

  // ── I-SM-02 ──
  it('session view contains no hashes / family / userId', async () => {
    const { accessToken } = await loginAs(harness, 'shape@example.com');

    const res = await request(harness.app.getHttpServer())
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    const view = res.body[0];
    expect(Object.keys(view).sort()).toEqual(
      ['createdAt', 'deviceName', 'id', 'isCurrent', 'lastUsedAt'].sort()
    );
  });

  // ── I-SM-03 ──
  it('DELETE /auth/sessions/:id revokes one session', async () => {
    const email = 'delete-one@example.com';
    const a = await loginAs(harness, email, DEVICE_HEADERS);
    const b = await loginAs(harness, email, deviceHeadersFor('device-X'));

    const otherSession = await harness.sessionModel.findOne({
      deviceId: 'device-X',
    });

    await request(harness.app.getHttpServer())
      .delete(`/api/auth/sessions/${otherSession!._id.toString()}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    // B token now rejected
    const rejected = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .expect(401);
    expect(rejected.body.code).toBe(AuthErrorCode.SESSION_REVOKED);

    // A still works
    await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    const revoked = await harness.sessionModel.findById(otherSession!._id).lean();
    expect(revoked!.revokedReason).toBe(SessionRevokedReason.LOGOUT);
  });

  // ── I-SM-04 ──
  it('DELETE /auth/sessions/:id rejects sessions owned by another user', async () => {
    const a = await loginAs(harness, 'owner-a@example.com', DEVICE_HEADERS);
    const b = await loginAs(
      harness,
      'owner-b@example.com',
      deviceHeadersFor('device-for-b')
    );

    const bSession = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(b.userId),
    });

    const res = await request(harness.app.getHttpServer())
      .delete(`/api/auth/sessions/${bSession!._id.toString()}`)
      .set('Authorization', `Bearer ${a.accessToken}`);

    expect(res.status).toBe(401);

    const bUnchanged = await harness.sessionModel.findById(bSession!._id).lean();
    expect(bUnchanged!.revokedAt).toBeNull();
  });

  // ── I-SM-05 ──
  it('DELETE /auth/sessions/:id with an invalid id returns 4xx', async () => {
    const { accessToken } = await loginAs(harness, 'badid@example.com');

    const res = await request(harness.app.getHttpServer())
      .delete('/api/auth/sessions/not-an-objectid')
      .set('Authorization', `Bearer ${accessToken}`);

    // Could be 400 (ValidationException) or 401 (cast to ObjectId → not found → cannot revoke)
    // Our service currently throws BadRequestException on null → 400
    expect([400, 401]).toContain(res.status);
  });

  // ── I-SM-06 ──
  it('all session endpoints require authentication', async () => {
    await request(harness.app.getHttpServer()).get('/api/auth/sessions').expect(401);
    await request(harness.app.getHttpServer())
      .delete('/api/auth/sessions/abc')
      .expect(401);
    await request(harness.app.getHttpServer()).post('/api/auth/logout-all').expect(401);
    await request(harness.app.getHttpServer()).post('/api/auth/logout').expect(401);
  });
});
