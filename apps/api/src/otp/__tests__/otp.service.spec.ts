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
  return new OtpService(mockOtpRepo as any, mockConfigService as any);
}

// ── Tests ──

describe('OtpService', () => {
  let service: OtpService;

  beforeEach(() => {
    jest.resetAllMocks();
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

    it('should not delete OTPs on failed verification', async () => {
      const otpDoc = makeOtpDoc();
      mockOtpRepo.findLatestByEmail.mockResolvedValue(ok(otpDoc));
      mockOtpRepo.incrementAttempts.mockResolvedValue(ok({ ...otpDoc, attempts: 1 }));

      await expect(service.verifyOtp(TEST_EMAIL, '000000')).rejects.toThrow(BadRequestException);

      expect(mockOtpRepo.deleteByEmail).not.toHaveBeenCalled();
    });
  });
});
