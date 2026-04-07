import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
import { OtpService } from '../otp.service';

// ── Helpers ──

const TEST_EMAIL = 'user@example.com';

function makeOtpDoc(overrides: Record<string, unknown> = {}) {
  const code = '123456';
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  return {
    _id: new Types.ObjectId(),
    email: TEST_EMAIL,
    codeHash,
    attempts: 0,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min from now
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Mocks ──

const mockOtpRepo = {
  create: jest.fn(),
  findLatestByEmail: jest.fn(),
  incrementAttempts: jest.fn(),
  deleteByEmail: jest.fn(),
  countRecentByEmail: jest.fn(),
};

const mockEmailService = {
  sendOtp: jest.fn().mockResolvedValue(undefined),
};

const mockEmailLockout = {
  checkLockout: jest.fn(),
  recordFailure: jest.fn(),
  clearLockout: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: unknown) => {
    const config: Record<string, unknown> = {
      'app.otp.expiryMinutes': 5,
      'app.otp.maxAttempts': 3,
      'app.otp.rateLimitMax': 3,
      'app.otp.rateLimitWindowMinutes': 10,
      'app.nodeEnv': 'test',
    };
    return config[key] ?? defaultValue;
  }),
};

function createService(): OtpService {
  return new OtpService(mockOtpRepo as any, mockConfigService as any, mockEmailService as any, mockEmailLockout as any);
}

// ── Tests ──

describe('OtpService', () => {
  let service: OtpService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockEmailService.sendOtp.mockResolvedValue(undefined);
    mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(null));
    mockOtpRepo.deleteByEmail.mockResolvedValue(ok(0));
    mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        'app.otp.expiryMinutes': 5,
        'app.otp.maxAttempts': 3,
        'app.otp.rateLimitMax': 3,
        'app.otp.rateLimitWindowMinutes': 10,
        'app.nodeEnv': 'test',
      };
      return config[key] ?? defaultValue;
    });
    service = createService();
  });

  // ─── sendOtp ───

  describe('sendOtp', () => {
    it('should generate and store an OTP successfully', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      const result = await service.sendOtp(TEST_EMAIL);

      expect(result.message).toBe('OTP sent successfully');
      expect(mockOtpRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: TEST_EMAIL,
          codeHash: expect.any(String),
          expiresAt: expect.any(Date),
        })
      );
    });

    it('should normalize email to lowercase', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      await service.sendOtp('User@Example.COM');

      expect(mockOtpRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com' })
      );
    });

    it('should not check lockout when sending (allows re-request after failed verify)', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      await service.sendOtp(TEST_EMAIL);

      expect(mockEmailLockout.checkLockout).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when rate limited', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(3));

      await expect(service.sendOtp(TEST_EMAIL)).rejects.toThrow(BadRequestException);
      expect(mockOtpRepo.create).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException when create fails', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(err({ code: 'DB_ERROR', message: 'Failed' }));

      await expect(service.sendOtp(TEST_EMAIL)).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException when rate limit check fails', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'Failed' })
      );

      await expect(service.sendOtp(TEST_EMAIL)).rejects.toThrow(InternalServerErrorException);
    });

    it('should include devOtp in non-production mode', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      const result = await service.sendOtp(TEST_EMAIL);

      expect(result.devOtp).toBeDefined();
      expect(result.devOtp).toMatch(/^\d{6}$/);
    });

    it('should NOT include devOtp in production mode', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          'app.otp.expiryMinutes': 5,
          'app.otp.maxAttempts': 3,
          'app.otp.rateLimitMax': 3,
          'app.otp.rateLimitWindowMinutes': 10,
          NODE_ENV: 'production',
        };
        return config[key] ?? defaultValue;
      });
      // Re-create service so constructor reads fresh config
      const prodService = createService();
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      const result = await prodService.sendOtp(TEST_EMAIL);

      expect(result.devOtp).toBeUndefined();
    });

    it('should call emailService.sendOtp with correct args', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      const result = await service.sendOtp(TEST_EMAIL);

      expect(mockEmailService.sendOtp).toHaveBeenCalledWith(
        TEST_EMAIL,
        result.devOtp, // in test mode devOtp is the raw code
        5 // expiryMinutes
      );
    });

    it('should not throw when email delivery fails', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));
      mockEmailService.sendOtp.mockRejectedValue(new Error('SMTP timeout'));

      const result = await service.sendOtp(TEST_EMAIL);

      expect(result.message).toBe('OTP sent successfully');
    });

    it('should set correct expiry based on config', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      const before = Date.now();
      await service.sendOtp(TEST_EMAIL);
      const after = Date.now();

      const createCall = mockOtpRepo.create.mock.calls[0][0];
      const expiresAt = createCall.expiresAt.getTime();

      // Should be approximately 5 minutes from now
      expect(expiresAt).toBeGreaterThanOrEqual(before + 5 * 60 * 1000 - 100);
      expect(expiresAt).toBeLessThanOrEqual(after + 5 * 60 * 1000 + 100);
    });

    it('should delete old OTPs before creating new one', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(null));
      mockOtpRepo.deleteByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      await service.sendOtp(TEST_EMAIL);

      expect(mockOtpRepo.deleteByEmail).toHaveBeenCalledWith(TEST_EMAIL);
      // deleteByEmail should be called before create
      const deleteOrder = mockOtpRepo.deleteByEmail.mock.invocationCallOrder[0];
      const createOrder = mockOtpRepo.create.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(createOrder);
    });

    it('should carry over attempt count from existing unexpired OTP', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(makeOtpDoc({ attempts: 2 })));
      mockOtpRepo.deleteByEmail.mockResolvedValue(ok(1));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      await service.sendOtp(TEST_EMAIL);

      expect(mockOtpRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 2 })
      );
    });

    it('should not carry over attempts from expired OTP', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.findLatestByEmail.mockResolvedValue(
        ok(makeOtpDoc({ attempts: 2, expiresAt: new Date(Date.now() - 1000) }))
      );
      mockOtpRepo.deleteByEmail.mockResolvedValue(ok(1));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      await service.sendOtp(TEST_EMAIL);

      expect(mockOtpRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 0 })
      );
    });

    it('should create with zero attempts when no existing OTP', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(null));
      mockOtpRepo.deleteByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      await service.sendOtp(TEST_EMAIL);

      expect(mockOtpRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 0 })
      );
    });
  });

  // ─── verifyOtp ───

  describe('verifyOtp', () => {
    it('should verify a valid OTP successfully', async () => {
      const code = '654321';
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(makeOtpDoc({ codeHash })));
      mockOtpRepo.deleteByEmail.mockResolvedValue(ok(1));

      const result = await service.verifyOtp(TEST_EMAIL, code);

      expect(result).toEqual({ email: TEST_EMAIL, valid: true });
      expect(mockOtpRepo.deleteByEmail).toHaveBeenCalledWith(TEST_EMAIL);
    });

    it('should normalize email to lowercase', async () => {
      const code = '654321';
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(makeOtpDoc({ codeHash })));
      mockOtpRepo.deleteByEmail.mockResolvedValue(ok(1));

      const result = await service.verifyOtp('User@Example.COM', code);

      expect(result.email).toBe('user@example.com');
      expect(mockOtpRepo.findLatestByEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('should throw BadRequestException when no OTP found', async () => {
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(null));

      await expect(service.verifyOtp(TEST_EMAIL, '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when OTP is expired', async () => {
      mockOtpRepo.findLatestByEmail.mockResolvedValue(
        ok(makeOtpDoc({ expiresAt: new Date(Date.now() - 1000) }))
      );

      await expect(service.verifyOtp(TEST_EMAIL, '123456')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when max attempts exceeded', async () => {
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(makeOtpDoc({ attempts: 3 })));

      await expect(service.verifyOtp(TEST_EMAIL, '123456')).rejects.toThrow(BadRequestException);
    });

    it('should increment attempts on invalid code', async () => {
      const otpDoc = makeOtpDoc();
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(otpDoc));
      mockOtpRepo.incrementAttempts.mockResolvedValue(ok({ ...otpDoc, attempts: 1 }));

      await expect(service.verifyOtp(TEST_EMAIL, '000000')).rejects.toThrow(BadRequestException);

      expect(mockOtpRepo.incrementAttempts).toHaveBeenCalledWith(otpDoc._id.toString());
    });

    it('should delete all OTPs for email after successful verification', async () => {
      const code = '654321';
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(makeOtpDoc({ codeHash })));
      mockOtpRepo.deleteByEmail.mockResolvedValue(ok(2));

      await service.verifyOtp(TEST_EMAIL, code);

      expect(mockOtpRepo.deleteByEmail).toHaveBeenCalledWith(TEST_EMAIL);
    });

    it('should throw InternalServerErrorException when find fails', async () => {
      mockOtpRepo.findLatestByEmail.mockResolvedValue(err({ code: 'DB_ERROR', message: 'Failed' }));

      await expect(service.verifyOtp(TEST_EMAIL, '123456')).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('should check lockout before verifying', async () => {
      mockEmailLockout.checkLockout.mockImplementation(() => {
        throw new Error('locked');
      });

      await expect(service.verifyOtp(TEST_EMAIL, '123456')).rejects.toThrow('locked');
      expect(mockOtpRepo.findLatestByEmail).not.toHaveBeenCalled();
    });

    it('should record failure on invalid code', async () => {
      const otpDoc = makeOtpDoc();
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(otpDoc));
      mockOtpRepo.incrementAttempts.mockResolvedValue(ok({ ...otpDoc, attempts: 1 }));

      await expect(service.verifyOtp(TEST_EMAIL, '000000')).rejects.toThrow(BadRequestException);

      expect(mockEmailLockout.recordFailure).toHaveBeenCalledWith(TEST_EMAIL);
    });

    it('should clear lockout on successful verify', async () => {
      const code = '654321';
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(makeOtpDoc({ codeHash })));
      mockOtpRepo.deleteByEmail.mockResolvedValue(ok(1));

      await service.verifyOtp(TEST_EMAIL, code);

      expect(mockEmailLockout.clearLockout).toHaveBeenCalledWith(TEST_EMAIL);
    });

    it('should not delete OTPs on failed verification', async () => {
      const otpDoc = makeOtpDoc();
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(otpDoc));
      mockOtpRepo.incrementAttempts.mockResolvedValue(ok({ ...otpDoc, attempts: 1 }));

      await expect(service.verifyOtp(TEST_EMAIL, '000000')).rejects.toThrow(BadRequestException);

      expect(mockOtpRepo.deleteByEmail).not.toHaveBeenCalled();
    });
  });
});
