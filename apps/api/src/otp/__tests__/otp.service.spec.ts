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
  claimVerificationAttempt: jest.fn(),
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
    // Default: an attempt slot is available (claim succeeds). Tests that need the
    // cap-reached path override this with ok(null).
    mockOtpRepo.claimVerificationAttempt.mockResolvedValue(ok(makeOtpDoc()));
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

    it('never returns the OTP code in the response, regardless of env', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      for (const env of ['development', 'test', 'production']) {
        mockConfigService.get.mockImplementation((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            'app.otp.expiryMinutes': 5,
            'app.otp.maxAttempts': 3,
            'app.otp.rateLimitMax': 3,
            'app.otp.rateLimitWindowMinutes': 10,
            'app.nodeEnv': env,
          };
          return config[key] ?? defaultValue;
        });

        const result = await createService().sendOtp(TEST_EMAIL);

        expect(result).toEqual({ message: 'OTP sent successfully' });
        expect(result).not.toHaveProperty('devOtp');
      }
    });

    it('delivers the generated code to the email service', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      await service.sendOtp(TEST_EMAIL);

      expect(mockEmailService.sendOtp).toHaveBeenCalledWith(
        TEST_EMAIL,
        expect.stringMatching(/^\d{6}$/),
        5
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

    it('does NOT delete old OTPs on send — that would wipe the rate-limit window', async () => {
      mockOtpRepo.countRecentByEmail.mockResolvedValue(ok(0));
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(null));
      mockOtpRepo.create.mockResolvedValue(ok(makeOtpDoc()));

      await service.sendOtp(TEST_EMAIL);

      // Prior rows must survive so checkRateLimit can count real send volume;
      // superseded codes are inert (verify picks the latest + rejects expired).
      expect(mockOtpRepo.deleteByEmail).not.toHaveBeenCalled();
      expect(mockOtpRepo.create).toHaveBeenCalled();
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

    it('should throw BadRequestException when the attempt cap is reached (claim returns null)', async () => {
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(makeOtpDoc({ attempts: 3 })));
      mockOtpRepo.claimVerificationAttempt.mockResolvedValue(ok(null)); // no slot left

      await expect(service.verifyOtp(TEST_EMAIL, '123456')).rejects.toThrow(BadRequestException);
    });

    it('atomically claims an attempt (with maxAttempts) on invalid code', async () => {
      const otpDoc = makeOtpDoc();
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(otpDoc));
      mockOtpRepo.claimVerificationAttempt.mockResolvedValue(ok(otpDoc)); // slot claimed

      await expect(service.verifyOtp(TEST_EMAIL, '000000')).rejects.toThrow(BadRequestException);

      expect(mockOtpRepo.claimVerificationAttempt).toHaveBeenCalledWith(otpDoc._id.toString(), 3);
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
      mockOtpRepo.claimVerificationAttempt.mockResolvedValue(ok(otpDoc));

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
      mockOtpRepo.claimVerificationAttempt.mockResolvedValue(ok(otpDoc));

      await expect(service.verifyOtp(TEST_EMAIL, '000000')).rejects.toThrow(BadRequestException);

      expect(mockOtpRepo.deleteByEmail).not.toHaveBeenCalled();
    });
  });
});
