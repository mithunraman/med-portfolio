import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { EmailService } from '../../email';
import { EmailLockoutService } from '../email-lockout.service';
import { OtpRepository } from '../otp.repository';
import { OTP_REPOSITORY } from '../otp.repository.interface';
import { OtpService } from '../otp.service';
import { Otp, OtpDocument, OtpSchema } from '../schemas/otp.schema';

// Config matching the production defaults exercised by the fix.
const RATE_LIMIT_MAX = 3;
const WINDOW_MINUTES = 10;
const EXPIRY_MINUTES = 5;
const CONFIG: Record<string, unknown> = {
  'app.otp.expiryMinutes': EXPIRY_MINUTES,
  'app.otp.maxAttempts': 3,
  'app.otp.rateLimitMax': RATE_LIMIT_MAX,
  'app.otp.rateLimitWindowMinutes': WINDOW_MINUTES,
  'app.isDevelopment': false,
};

const EMAIL = 'user@example.com';
const hash = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

describe('OtpService (integration)', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let service: OtpService;
  let model: Model<OtpDocument>;
  let lockout: EmailLockoutService;
  const emailSend = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Otp.name, schema: OtpSchema }]),
      ],
      providers: [
        { provide: OTP_REPOSITORY, useClass: OtpRepository },
        EmailLockoutService,
        OtpService,
        { provide: ConfigService, useValue: { get: (k: string, d?: unknown) => CONFIG[k] ?? d } },
        { provide: EmailService, useValue: { sendOtp: emailSend } },
      ],
    }).compile();

    await module.init();
    service = module.get(OtpService);
    model = module.get<Model<OtpDocument>>(getModelToken(Otp.name));
    lockout = module.get(EmailLockoutService);
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
    emailSend.mockClear();
    // In-memory lockout persists across tests — clear it so cases are independent.
    lockout.clearLockout(EMAIL);
  });

  // Insert an OTP row directly via the raw driver (bypasses Mongoose timestamps,
  // so an explicit createdAt sticks — needed for the window/ordering tests).
  async function seedOtp(
    overrides: { code?: string; attempts?: number; createdAt?: Date; expiresAt?: Date } = {}
  ) {
    const now = new Date();
    await model.collection.insertOne({
      email: EMAIL,
      codeHash: hash(overrides.code ?? '000000'),
      attempts: overrides.attempts ?? 0,
      expiresAt: overrides.expiresAt ?? new Date(now.getTime() + EXPIRY_MINUTES * 60_000),
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.createdAt ?? now,
    });
  }

  describe('per-email send rate limit', () => {
    it('allows rateLimitMax sends then blocks the next (window no longer wiped)', async () => {
      for (let i = 0; i < RATE_LIMIT_MAX; i++) {
        await expect(service.sendOtp(EMAIL)).resolves.toEqual({ message: 'OTP sent successfully' });
      }

      // Rows accumulate (send does not delete) → the (max+1)th is rejected.
      await expect(service.sendOtp(EMAIL)).rejects.toThrow(BadRequestException);

      const rows = await model.countDocuments({ email: EMAIL });
      expect(rows).toBe(RATE_LIMIT_MAX); // the blocked send never created a row
    });

    it('does not count sends older than the rate-limit window', async () => {
      // rateLimitMax rows created outside the 10m window must not block a new send.
      const stale = new Date(Date.now() - (WINDOW_MINUTES + 5) * 60_000);
      for (let i = 0; i < RATE_LIMIT_MAX; i++) {
        await seedOtp({ createdAt: stale });
      }

      await expect(service.sendOtp(EMAIL)).resolves.toEqual({ message: 'OTP sent successfully' });
    });
  });

  describe('verify still honours latest-code-wins after multiple sends', () => {
    it('rejects a superseded code and accepts only the latest', async () => {
      await seedOtp({ code: '111111', createdAt: new Date(Date.now() - 60_000) });
      await seedOtp({ code: '222222', createdAt: new Date() });

      // Older, un-deleted code is inert.
      await expect(service.verifyOtp(EMAIL, '111111')).rejects.toThrow(BadRequestException);
      // Latest code verifies.
      await expect(service.verifyOtp(EMAIL, '222222')).resolves.toBeDefined();
    });

    it('breaks createdAt ties deterministically by _id (same-millisecond sends)', async () => {
      // Two rows with identical createdAt but different _id — the higher _id wins.
      const sameInstant = new Date();
      const idA = new Types.ObjectId();
      const idB = new Types.ObjectId();
      const [lowId, highId] = idA.toString() < idB.toString() ? [idA, idB] : [idB, idA];

      await model.collection.insertOne({
        _id: lowId,
        email: EMAIL,
        codeHash: hash('101010'),
        attempts: 0,
        expiresAt: new Date(sameInstant.getTime() + EXPIRY_MINUTES * 60_000),
        createdAt: sameInstant,
        updatedAt: sameInstant,
      });
      await model.collection.insertOne({
        _id: highId,
        email: EMAIL,
        codeHash: hash('202020'),
        attempts: 0,
        expiresAt: new Date(sameInstant.getTime() + EXPIRY_MINUTES * 60_000),
        createdAt: sameInstant,
        updatedAt: sameInstant,
      });

      // Deterministic: the higher-_id row is "latest"; its code verifies, the tied one doesn't.
      await expect(service.verifyOtp(EMAIL, '101010')).rejects.toThrow(BadRequestException);
      await expect(service.verifyOtp(EMAIL, '202020')).resolves.toBeDefined();
    });
  });

  describe('attempt cap (atomic, race-safe)', () => {
    const MAX = 3; // app.otp.maxAttempts

    it('caps concurrent wrong-code verifies at maxAttempts (no TOCTOU bypass)', async () => {
      await seedOtp({ code: '424242', attempts: 0 });

      // Fire many concurrent verifies with a wrong code in one burst. Pre-fix, all
      // would read attempts=0 and increment → 8 guesses; the atomic claim caps at MAX.
      const BURST = 8;
      const results = await Promise.allSettled(
        Array.from({ length: BURST }, () => service.verifyOtp(EMAIL, '999999'))
      );

      expect(results.every((r) => r.status === 'rejected')).toBe(true);

      // Exactly MAX slots were claimed → attempts lands at MAX, never BURST.
      const row = await model.findOne({ email: EMAIL }).lean();
      expect(row!.attempts).toBe(MAX);

      // MAX requests claimed a slot (→ "Invalid OTP code"); the rest hit the cap.
      const messages = results.map((r) =>
        r.status === 'rejected' ? (r.reason as Error).message : ''
      );
      expect(messages.filter((m) => m.includes('Invalid OTP code')).length).toBe(MAX);
      expect(messages.filter((m) => m.includes('Too many failed attempts')).length).toBe(BURST - MAX);
    });

    it('accepts a correct code while attempts remain', async () => {
      await seedOtp({ code: '424242', attempts: MAX - 1 });

      await expect(service.verifyOtp(EMAIL, '424242')).resolves.toBeDefined();
      // Verified → all rows for the email are cleared.
      expect(await model.countDocuments({ email: EMAIL })).toBe(0);
    });

    it('rejects even a correct code once the cap is reached', async () => {
      await seedOtp({ code: '424242', attempts: MAX });

      await expect(service.verifyOtp(EMAIL, '424242')).rejects.toThrow(BadRequestException);
      // Not consumed/deleted — the row is untouched.
      expect(await model.countDocuments({ email: EMAIL })).toBe(1);
    });
  });

  describe('carry-over attempts across a re-send', () => {
    it('preserves the failed-attempt count on the newly issued code', async () => {
      // Older-but-unexpired prior code (createdAt 2m ago, expiresAt still in the future).
      await seedOtp({ code: '333333', attempts: 2, createdAt: new Date(Date.now() - 2 * 60_000) });

      await service.sendOtp(EMAIL);

      // The freshly issued (latest) code must inherit the prior attempt count.
      const latest = await model.findOne({ email: EMAIL }).sort({ createdAt: -1 }).lean();
      expect(latest!.codeHash).not.toBe(hash('333333')); // it's the new code
      expect(latest!.attempts).toBe(2);
    });
  });

  describe('index configuration', () => {
    it('retains rows by createdAt, not expiresAt', async () => {
      const indexes = await model.collection.indexes();
      const ttl = indexes.filter((i) => typeof i.expireAfterSeconds === 'number');

      expect(ttl).toHaveLength(1);
      expect(ttl[0].key).toEqual({ createdAt: 1 });
      expect(ttl[0].expireAfterSeconds).toBeGreaterThanOrEqual(WINDOW_MINUTES * 60);
      // The old expiresAt TTL must be gone, or rows would be reaped before the window closes.
      expect(indexes.some((i) => i.key.expiresAt !== undefined)).toBe(false);
    });

    it('has no standalone email index (redundant with the { email, createdAt } compound)', async () => {
      const indexes = await model.collection.indexes();

      // The compound serves every email query; a lone { email: 1 } would be pure write cost.
      expect(indexes.some((i) => JSON.stringify(i.key) === JSON.stringify({ email: 1 }))).toBe(false);
      expect(indexes.some((i) => JSON.stringify(i.key) === JSON.stringify({ email: 1, createdAt: -1 }))).toBe(true);
    });
  });
});
