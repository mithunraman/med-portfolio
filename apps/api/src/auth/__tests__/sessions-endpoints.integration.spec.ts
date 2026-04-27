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
  loginWithOtp,
} from './helpers/auth-test-harness';

jest.setTimeout(45000);

function loginAs(
  harness: AuthTestHarness,
  email: string,
  headers = DEVICE_HEADERS,
  name = 'Test User'
) {
  return loginWithOtp(harness, { email, device: headers, name });
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
  it('DELETE /auth/sessions/:xid revokes one session', async () => {
    const email = 'delete-one@example.com';
    const a = await loginAs(harness, email, DEVICE_HEADERS);
    const b = await loginAs(harness, email, deviceHeadersFor('device-X'));

    const otherSession = await harness.sessionModel.findOne({ deviceId: 'device-X' });

    await request(harness.app.getHttpServer())
      .delete(`/api/auth/sessions/${otherSession!.xid}`)
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
  it('DELETE /auth/sessions/:xid does not reveal sessions owned by another user', async () => {
    const a = await loginAs(harness, 'owner-a@example.com', DEVICE_HEADERS);
    const b = await loginAs(
      harness,
      'owner-b@example.com',
      deviceHeadersFor('device-for-b')
    );

    const bSession = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(b.userId),
    });

    // Atomic ownership check → 400 regardless of which failure case (not-mine,
    // not-found, or already-revoked). The session must remain active.
    const res = await request(harness.app.getHttpServer())
      .delete(`/api/auth/sessions/${bSession!.xid}`)
      .set('Authorization', `Bearer ${a.accessToken}`);

    expect(res.status).toBe(400);

    const bUnchanged = await harness.sessionModel.findById(bSession!._id).lean();
    expect(bUnchanged!.revokedAt).toBeNull();
  });

  // ── I-SM-05 ──
  it('DELETE /auth/sessions/:xid with an unknown xid returns 400', async () => {
    const { accessToken } = await loginAs(harness, 'badid@example.com');

    const res = await request(harness.app.getHttpServer())
      .delete('/api/auth/sessions/no-such-xid')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
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
