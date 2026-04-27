import request from 'supertest';
import {
  AuthTestHarness,
  cleanupAuthCollections,
  createAuthHarness,
  DEVICE_HEADERS,
  destroyAuthHarness,
  lastSentOtp,
} from './helpers/auth-test-harness';

jest.setTimeout(30000);

describe('Auth harness smoke test', () => {
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

  it('boots and serves /api/auth/otp/send', async () => {
    const res = await request(harness.app.getHttpServer())
      .post('/api/auth/otp/send')
      .send({ email: 'smoke@example.com' })
      .expect(200);

    expect(res.body).toMatchObject({
      message: expect.any(String),
      isNewUser: true,
    });
    expect(res.body).not.toHaveProperty('devOtp');

    const otp = lastSentOtp(harness, 'smoke@example.com');
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('requires auth on /api/auth/me', async () => {
    await request(harness.app.getHttpServer())
      .get('/api/auth/me')
      .set(DEVICE_HEADERS)
      .expect(401);
  });
});
