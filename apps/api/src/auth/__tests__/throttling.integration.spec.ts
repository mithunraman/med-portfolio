import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SkipAllThrottles } from '../../common/throttler/throttler.decorators';
import { rateLimitConfig } from '../../config/rate-limit.config';
import {
  AuthTestHarness,
  createAuthHarness,
  DEVICE_HEADERS,
  destroyAuthHarness,
  resetThrottler,
} from './helpers/auth-test-harness';

jest.setTimeout(45000);

/**
 * Item 45 + tiers: the per-route @RateLimit overrides must actually bind, and
 * @SkipAllThrottles must actually exempt. These are the regression guards
 * against the `default`-keyed no-op that made every override/skip silent.
 */
describe('Rate limit enforcement', () => {
  let harness: AuthTestHarness;

  beforeAll(async () => {
    harness = await createAuthHarness();
  });

  afterAll(async () => {
    await destroyAuthHarness(harness);
  });

  beforeEach(() => {
    // Isolate each boundary test from the others' per-IP counters.
    resetThrottler(harness);
  });

  it('otp/send is bounded to 60 / 10min per IP — the 61st is 429', async () => {
    const server = harness.app.getHttpServer();
    // Distinct emails so the per-email send cap (3/10min) never trips — this
    // isolates the per-IP tier. Cap is generous by design (CGNAT tolerance);
    // the per-email cap is the primary send control.
    for (let i = 0; i < 60; i++) {
      await request(server)
        .post('/api/auth/otp/send')
        .send({ email: `send${i}@example.com` })
        .expect(200);
    }
    await request(server)
      .post('/api/auth/otp/send')
      .send({ email: 'send-over@example.com' })
      .expect(429);
  });

  it('otp/verify is bounded to 30 / 10min per IP — the 31st is 429', async () => {
    const server = harness.app.getHttpServer();
    // Distinct emails so the per-email lockout never accumulates; the per-IP
    // throttler still counts every call regardless of the (failing) body.
    for (let i = 0; i < 30; i++) {
      const res = await request(server)
        .post('/api/auth/otp/verify')
        .set(DEVICE_HEADERS)
        .send({ email: `verify${i}@example.com`, code: '000000' });
      expect(res.status).not.toBe(429);
    }
    await request(server)
      .post('/api/auth/otp/verify')
      .set(DEVICE_HEADERS)
      .send({ email: 'verify-over@example.com', code: '000000' })
      .expect(429);
  });

  it('claim is bounded to 10 / 10min per IP — the 11th is 429', async () => {
    const server = harness.app.getHttpServer();
    // claim requires a guest JWT, but ThrottlerGuard is registered before
    // JwtAuthGuard (app.module.ts) so it counts every request before auth
    // rejects it — an unauthenticated call still exercises the per-route cap.
    // The first 10 come back 401 (no token); only the 11th trips the throttler.
    for (let i = 0; i < 10; i++) {
      const res = await request(server)
        .post('/api/auth/claim')
        .set(DEVICE_HEADERS)
        .send({ email: `claim${i}@example.com`, code: '000000' });
      expect(res.status).not.toBe(429);
    }
    await request(server)
      .post('/api/auth/claim')
      .set(DEVICE_HEADERS)
      .send({ email: 'claim-over@example.com', code: '000000' })
      .expect(429);
  });

  it('refresh is bounded to 30 / min per IP — the 31st is 429', async () => {
    const server = harness.app.getHttpServer();
    for (let i = 0; i < 30; i++) {
      const res = await request(server)
        .post('/api/auth/refresh')
        .set(DEVICE_HEADERS)
        .send({ refreshToken: 'bogus-token' });
      expect(res.status).not.toBe(429);
    }
    await request(server)
      .post('/api/auth/refresh')
      .set(DEVICE_HEADERS)
      .send({ refreshToken: 'bogus-token' })
      .expect(429);
  });
});

/**
 * A throwaway controller exempted via @SkipAllThrottles, wired to the REAL
 * throttler config + guard. Hammering it past the tightest tier must stay 200 —
 * this is the test that would have caught the broken bare @SkipThrottle().
 */
@SkipAllThrottles()
@Controller('probe')
class ProbeController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('SkipAllThrottles exemption', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: Object.values(rateLimitConfig) })],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('an exempt route is never throttled, even past the tightest tier', async () => {
    const server = app.getHttpServer();
    const overLimit = rateLimitConfig.short.limit + 5;
    for (let i = 0; i < overLimit; i++) {
      await request(server).get('/probe').expect(200);
    }
  });
});
