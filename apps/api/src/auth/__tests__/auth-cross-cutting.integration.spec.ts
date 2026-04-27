import { AuthErrorCode } from '@acme/shared';
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import request from 'supertest';
import {
  AuthTestHarness,
  cleanupAuthCollections,
  createAuthHarness,
  DEVICE_HEADERS,
  destroyAuthHarness,
  loginWithOtp,
  TEST_JWT_SECRET,
} from './helpers/auth-test-harness';

jest.setTimeout(60000);

function loginAs(harness: AuthTestHarness, email: string) {
  return loginWithOtp(harness, { email, name: 'User' });
}

describe('Auth cross-cutting concerns', () => {
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

  // ── I-CR-04 ──
  it('rejects a JWT signed with a different secret', async () => {
    const sessionId = new Types.ObjectId();
    const forged = jwt.sign(
      { sub: new Types.ObjectId().toString(), role: 0, sid: sessionId.toString() },
      'a-different-wrong-secret-still-32-chars-long',
      { expiresIn: '60m' }
    );

    const res = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  // ── I-CR-05 ──
  it('rejects a JWT missing the sid claim', async () => {
    const { accessToken: realToken, userId } = await loginAs(
      harness,
      'nosid@example.com'
    );
    // Build a JWT that validly signs but has no sid
    const forged = jwt.sign({ sub: userId, role: 0 }, TEST_JWT_SECRET, {
      expiresIn: '60m',
    });

    const res = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(AuthErrorCode.TOKEN_INVALID);
    void realToken;
  });

  // ── I-CR-06 ──
  it('rejects an expired access token (Passport enforces exp)', async () => {
    const { userId } = await loginAs(harness, 'expired-jwt@example.com');

    // Session still active in DB; only the JWT itself is expired
    const session = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    const expired = jwt.sign(
      { sub: userId, role: 0, sid: session!._id.toString() },
      TEST_JWT_SECRET,
      { expiresIn: -10 } // issued already expired
    );

    const res = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
  });

  it('rejects a JWT with alg: none', async () => {
    const sessionId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

    // Hand-craft an unsigned token: base64url(header).base64url(payload).
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url'
    );
    const payload = Buffer.from(
      JSON.stringify({ sub: userId, role: 0, sid: sessionId, exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const unsigned = `${header}.${payload}.`;

    const res = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${unsigned}`);

    expect(res.status).toBe(401);
  });

  it('401 error responses expose code as a top-level JSON field', async () => {
    const forged = jwt.sign(
      { sub: new Types.ObjectId().toString(), role: 0 },
      TEST_JWT_SECRET,
      { expiresIn: '60m' }
    );

    const res = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code');
    expect(res.body.code).toBe(AuthErrorCode.TOKEN_INVALID);
  });

  it('guest logout is accepted (revokes the session)', async () => {
    const guestRes = await request(harness.app.getHttpServer())
      .post('/api/auth/guest')
      .set(DEVICE_HEADERS)
      .send({})
      .expect(201);

    await request(harness.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${guestRes.body.accessToken}`)
      .expect(200);

    const meAfter = await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${guestRes.body.accessToken}`);
    expect(meAfter.status).toBe(401);
    expect(meAfter.body.code).toBe(AuthErrorCode.SESSION_REVOKED);
  });

  it('two concurrent refresh calls with the same token: one wins, the other is rejected (may revoke family)', async () => {
    const { refreshToken } = await loginAs(harness, 'race@example.com');

    const [res1, res2] = await Promise.all([
      request(harness.app.getHttpServer())
        .post('/api/auth/refresh')
        .set(DEVICE_HEADERS)
        .send({ refreshToken }),
      request(harness.app.getHttpServer())
        .post('/api/auth/refresh')
        .set(DEVICE_HEADERS)
        .send({ refreshToken }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // One of three safe outcomes is acceptable; both-succeed is NOT.
    //   [200, 200] — UNSAFE (both rotations accepted; family not revoked)
    //   [200, 401] — expected normal outcome
    //   [401, 401] — both raced past the active-hash lookup; both treated as replay
    expect(statuses).not.toEqual([200, 200]);
    expect(statuses[0]).toBeGreaterThanOrEqual(200);
  });

  it('JwtService from the test app signs tokens the JwtStrategy accepts (sanity for other bonus tests)', async () => {
    const { userId } = await loginAs(harness, 'sanity@example.com');
    const session = await harness.sessionModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    const jwtService = harness.module.get<JwtService>(JwtService);
    const minted = jwtService.sign({
      sub: userId,
      role: 0,
      sid: session!._id.toString(),
    });
    await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${minted}`)
      .expect(200);
  });
});
