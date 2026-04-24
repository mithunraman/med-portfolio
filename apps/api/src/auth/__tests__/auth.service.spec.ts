import { AuthErrorCode, SessionRevokedReason, Specialty, UserRole } from '@acme/shared';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
import { AuthService } from '../auth.service';
import { DeviceInfo } from '../../common/decorators/device-info.decorator';

const userId = new Types.ObjectId();
const userIdStr = userId.toString();
const sessionId = new Types.ObjectId();
const sessionIdStr = sessionId.toString();

const device: DeviceInfo = {
  deviceId: 'device-uuid-1',
  deviceName: 'Apple iPhone 15',
};

function makeUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: userId,
    name: 'Test User',
    email: 'user@example.com',
    role: UserRole.USER,
    anonymizedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeGuestDoc(overrides: Record<string, unknown> = {}) {
  return makeUserDoc({
    name: 'Guest',
    email: 'guest_abc@guest.local',
    role: UserRole.USER_GUEST,
    ...overrides,
  });
}

function makeSessionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: sessionId,
    userId,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    refreshTokenHash: 'hash_current',
    refreshTokenFamily: 'fam_1',
    previousHashes: [],
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    revokedReason: null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
};

const mockSessionRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findActiveByRefreshHash: jest.fn(),
  findByPreviousHash: jest.fn(),
  findActiveByUserAndDevice: jest.fn(),
  listActiveByUser: jest.fn(),
  rotate: jest.fn(),
  revoke: jest.fn(),
  revokeAllByUser: jest.fn(),
  revokeFamily: jest.fn(),
};

const mockTokenService = {
  signAccessToken: jest.fn().mockReturnValue('access.jwt'),
  generateRefreshToken: jest.fn().mockReturnValue({ raw: 'raw_r1', hash: 'hash_r1' }),
  hashRefreshToken: jest.fn((raw: string) => `hash_${raw}`),
  generateFamily: jest.fn().mockReturnValue('fam_new'),
};

const mockOtpService = {
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue(90),
};

function createService(): AuthService {
  return new AuthService(
    mockUserModel as any,
    mockSessionRepo as any,
    mockTokenService as any,
    mockOtpService as any,
    mockConfigService as any
  );
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTokenService.signAccessToken.mockReturnValue('access.jwt');
    mockTokenService.generateRefreshToken.mockReturnValue({ raw: 'raw_r1', hash: 'hash_r1' });
    mockTokenService.generateFamily.mockReturnValue('fam_new');
    mockTokenService.hashRefreshToken.mockImplementation((raw: string) => `hash_${raw}`);
    mockSessionRepo.findActiveByUserAndDevice.mockResolvedValue(ok(null));
    mockSessionRepo.create.mockImplementation((input) =>
      Promise.resolve(ok(makeSessionDoc({ refreshTokenHash: input.refreshTokenHash })))
    );
    mockConfigService.get.mockReturnValue(90);
    service = createService();
  });

  describe('otpVerifyAndLogin', () => {
    it('creates a session and returns both tokens for a new user', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'new@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      const newUser = makeUserDoc({ email: 'new@example.com', name: 'Jane' });
      mockUserModel.create.mockResolvedValue(newUser);

      const result = await service.otpVerifyAndLogin('new@example.com', '123456', device, 'Jane');

      expect(result.accessToken).toBe('access.jwt');
      expect(result.refreshToken).toBe('raw_r1');
      expect(mockSessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: device.deviceId, refreshTokenHash: 'hash_r1' })
      );
    });

    it('supersedes existing session on the same device on re-login', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'user@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(makeUserDoc());
      mockSessionRepo.findActiveByUserAndDevice.mockResolvedValue(ok(makeSessionDoc()));

      await service.otpVerifyAndLogin('user@example.com', '123456', device);

      expect(mockSessionRepo.revoke).toHaveBeenCalledWith(
        sessionIdStr,
        SessionRevokedReason.SUPERSEDED
      );
    });

    it('rejects when deviceId header is missing', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'user@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(makeUserDoc());

      await expect(
        service.otpVerifyAndLogin('user@example.com', '123456', {
          deviceId: '',
          deviceName: 'x',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refreshSession', () => {
    it('rotates a valid refresh token and returns new pair', async () => {
      mockSessionRepo.findActiveByRefreshHash.mockResolvedValue(ok(makeSessionDoc()));
      mockUserModel.findById.mockResolvedValue(makeUserDoc());
      mockTokenService.generateRefreshToken.mockReturnValue({ raw: 'raw_r2', hash: 'hash_r2' });
      mockSessionRepo.rotate.mockResolvedValue(ok(makeSessionDoc({ refreshTokenHash: 'hash_r2' })));

      const result = await service.refreshSession('raw_r1', device);

      // CAS: (sessionId, expectedOldHash = hash of presented token, newHash)
      expect(mockSessionRepo.rotate).toHaveBeenCalledWith(
        sessionIdStr,
        'hash_raw_r1',
        'hash_r2'
      );
      expect(result).toEqual({ accessToken: 'access.jwt', refreshToken: 'raw_r2' });
    });

    it('revokes family and rejects on replay of a rotated token', async () => {
      mockSessionRepo.findActiveByRefreshHash.mockResolvedValue(ok(null));
      mockSessionRepo.findByPreviousHash.mockResolvedValue(
        ok(makeSessionDoc({ refreshTokenFamily: 'fam_1' }))
      );

      await expect(service.refreshSession('raw_old', device)).rejects.toMatchObject({
        response: { code: AuthErrorCode.REFRESH_INVALID },
      });
      expect(mockSessionRepo.revokeFamily).toHaveBeenCalledWith(
        'fam_1',
        SessionRevokedReason.ROTATION_REPLAY
      );
    });

    it('rejects an unknown refresh token without revoking any family', async () => {
      mockSessionRepo.findActiveByRefreshHash.mockResolvedValue(ok(null));
      mockSessionRepo.findByPreviousHash.mockResolvedValue(ok(null));

      await expect(service.refreshSession('raw_unknown', device)).rejects.toMatchObject({
        response: { code: AuthErrorCode.REFRESH_INVALID },
      });
      expect(mockSessionRepo.revokeFamily).not.toHaveBeenCalled();
    });

    it('rejects when session has expired', async () => {
      mockSessionRepo.findActiveByRefreshHash.mockResolvedValue(
        ok(makeSessionDoc({ expiresAt: new Date(Date.now() - 1000) }))
      );

      await expect(service.refreshSession('raw_r1', device)).rejects.toMatchObject({
        response: { code: AuthErrorCode.SESSION_EXPIRED },
      });
    });

    it('rejects when user has been anonymized', async () => {
      mockSessionRepo.findActiveByRefreshHash.mockResolvedValue(ok(makeSessionDoc()));
      mockUserModel.findById.mockResolvedValue(makeUserDoc({ anonymizedAt: new Date() }));

      await expect(service.refreshSession('raw_r1', device)).rejects.toMatchObject({
        response: { code: AuthErrorCode.USER_INACTIVE },
      });
    });
  });

  describe('claimGuestAccount', () => {
    it('upgrades guest, revokes old session, creates a new one', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'real@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      const guestDoc = makeGuestDoc();
      mockUserModel.findById.mockResolvedValue(guestDoc);

      const result = await service.claimGuestAccount(
        userIdStr,
        sessionIdStr,
        'real@example.com',
        '123456',
        'Real Name',
        device
      );

      expect(guestDoc.role).toBe(UserRole.USER);
      expect(guestDoc.email).toBe('real@example.com');
      expect(mockSessionRepo.revoke).toHaveBeenCalledWith(
        sessionIdStr,
        SessionRevokedReason.SUPERSEDED
      );
      expect(result.refreshToken).toBe('raw_r1');
    });

    it('rejects if email is already taken', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'taken@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(makeUserDoc({ email: 'taken@example.com' }));

      await expect(
        service.claimGuestAccount(
          userIdStr,
          sessionIdStr,
          'taken@example.com',
          '123456',
          'Name',
          device
        )
      ).rejects.toThrow(ConflictException);
    });

    it('rejects if the target is not a guest', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'real@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.findById.mockResolvedValue(makeUserDoc());

      await expect(
        service.claimGuestAccount(
          userIdStr,
          sessionIdStr,
          'real@example.com',
          '123456',
          'Name',
          device
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('logout / logoutAll / revokeSession', () => {
    it('logout revokes the current session', async () => {
      mockSessionRepo.revoke.mockResolvedValue(ok(undefined));
      await service.logout(sessionIdStr);
      expect(mockSessionRepo.revoke).toHaveBeenCalledWith(sessionIdStr, SessionRevokedReason.LOGOUT);
    });

    it('logoutAll revokes all sessions for the user', async () => {
      mockSessionRepo.revokeAllByUser.mockResolvedValue(ok(3));
      await service.logoutAll(userIdStr);
      expect(mockSessionRepo.revokeAllByUser).toHaveBeenCalledWith(
        userIdStr,
        SessionRevokedReason.LOGOUT_ALL
      );
    });

    it('revokeSession rejects if session belongs to a different user', async () => {
      mockSessionRepo.findById.mockResolvedValue(
        ok(makeSessionDoc({ userId: new Types.ObjectId() }))
      );
      await expect(service.revokeSession(userIdStr, sessionIdStr)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('updateProfile', () => {
    it('rejects invalid training stage for specialty', async () => {
      await expect(
        service.updateProfile(userIdStr, {
          specialty: Specialty.GP,
          trainingStage: 'CT1',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('updates specialty + stage', async () => {
      mockUserModel.findByIdAndUpdate.mockResolvedValue(
        makeUserDoc({ specialty: Specialty.GP, trainingStage: 'ST2' })
      );
      const result = await service.updateProfile(userIdStr, {
        specialty: Specialty.GP,
        trainingStage: 'ST2',
      });
      expect(result.specialty?.code).toBe(Specialty.GP);
    });
  });

  // ── U-AS-05 OTP failure propagation ──
  describe('otpVerifyAndLogin propagates OTP errors', () => {
    it('does not create a user or session when OTP verification throws', async () => {
      mockOtpService.verifyOtp.mockRejectedValue(new BadRequestException('Invalid OTP code.'));

      await expect(
        service.otpVerifyAndLogin('user@example.com', '000000', device)
      ).rejects.toThrow(BadRequestException);

      expect(mockUserModel.findOne).not.toHaveBeenCalled();
      expect(mockUserModel.create).not.toHaveBeenCalled();
      expect(mockSessionRepo.create).not.toHaveBeenCalled();
    });
  });

  // ── U-AS-06 fallback name from email prefix ──
  describe('otpVerifyAndLogin default name', () => {
    it('falls back to the email local-part when no name is provided for a new user', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'jane@x.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(
        makeUserDoc({ email: 'jane@x.com', name: 'jane' })
      );

      await service.otpVerifyAndLogin('jane@x.com', '123456', device);

      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'jane', email: 'jane@x.com' })
      );
    });
  });

  // ── U-AS-15 User deleted between session and user lookup ──
  describe('refreshSession when user disappears mid-flight', () => {
    it('rejects with USER_INACTIVE when userModel.findById returns null', async () => {
      mockSessionRepo.findActiveByRefreshHash.mockResolvedValue(ok(makeSessionDoc()));
      mockUserModel.findById.mockResolvedValue(null);

      await expect(service.refreshSession('raw_r1', device)).rejects.toMatchObject({
        response: { code: AuthErrorCode.USER_INACTIVE },
      });
    });
  });

  // ── U-AS-16 Rotate failure surfaces ──
  describe('refreshSession when rotate fails', () => {
    it('throws REFRESH_INVALID when the repository cannot rotate', async () => {
      mockSessionRepo.findActiveByRefreshHash.mockResolvedValue(ok(makeSessionDoc()));
      mockUserModel.findById.mockResolvedValue(makeUserDoc());
      mockTokenService.generateRefreshToken.mockReturnValue({
        raw: 'raw_r2',
        hash: 'hash_r2',
      });
      mockSessionRepo.rotate.mockResolvedValue(err({ code: 'DB_ERROR', message: 'boom' }));

      await expect(service.refreshSession('raw_r1', device)).rejects.toMatchObject({
        response: { code: AuthErrorCode.REFRESH_INVALID },
      });
    });
  });

  // ── U-AS-17 Replay logs a warning containing userId and family ──
  describe('refreshSession replay logging', () => {
    it('logs a warning with userId and family on replay', async () => {
      const warnSpy = jest
        .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
        .mockImplementation(() => {});

      mockSessionRepo.findActiveByRefreshHash.mockResolvedValue(ok(null));
      mockSessionRepo.findByPreviousHash.mockResolvedValue(
        ok(makeSessionDoc({ refreshTokenFamily: 'fam_abc' }))
      );

      await expect(service.refreshSession('raw_old', device)).rejects.toBeDefined();

      expect(warnSpy).toHaveBeenCalled();
      const msg = warnSpy.mock.calls[0][0] as string;
      expect(msg).toContain(userIdStr);
      expect(msg).toContain('fam_abc');
      warnSpy.mockRestore();
    });
  });

  // ── U-AS-20 registerGuest ──
  describe('registerGuest', () => {
    it('creates a guest user with USER_GUEST role and returns both tokens', async () => {
      const guestDoc = makeGuestDoc();
      mockUserModel.create.mockResolvedValue(guestDoc);

      const result = await service.registerGuest(device);

      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.USER_GUEST, name: 'Guest' })
      );
      expect(mockSessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: device.deviceId })
      );
      expect(result.accessToken).toBe('access.jwt');
      expect(result.refreshToken).toBe('raw_r1');
      expect(result.user.role).toBe(UserRole.USER_GUEST);
    });

    it('generates a unique guest email', async () => {
      const guestDoc = makeGuestDoc();
      mockUserModel.create.mockResolvedValue(guestDoc);

      await service.registerGuest(device);

      const createArg = mockUserModel.create.mock.calls[0][0];
      expect(createArg.email).toMatch(/^guest_.+@guest\.local$/);
    });
  });

  // ── U-AS-27 revokeSession when session not found ──
  describe('revokeSession with missing session', () => {
    it('throws BadRequestException', async () => {
      mockSessionRepo.findById.mockResolvedValue(ok(null));

      await expect(service.revokeSession(userIdStr, 'missing')).rejects.toThrow(
        BadRequestException
      );
      expect(mockSessionRepo.revoke).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when repo returns err', async () => {
      mockSessionRepo.findById.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'boom' })
      );

      await expect(service.revokeSession(userIdStr, 'any')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  // ── U-AS-28 listSessions view mapping ──
  describe('listSessions', () => {
    it('maps to SessionView[], flags current, hides hashes', async () => {
      const otherId = new Types.ObjectId();
      mockSessionRepo.listActiveByUser.mockResolvedValue(
        ok([
          makeSessionDoc({ _id: sessionId, deviceName: 'iOS iPhone' }),
          makeSessionDoc({ _id: otherId, deviceName: 'Android Pixel' }),
        ])
      );

      const result = await service.listSessions(userIdStr, sessionIdStr);

      expect(result).toHaveLength(2);
      const current = result.find((v) => v.id === sessionIdStr);
      const other = result.find((v) => v.id === otherId.toString());
      expect(current?.isCurrent).toBe(true);
      expect(other?.isCurrent).toBe(false);

      // No sensitive fields leak
      for (const view of result) {
        expect(view).not.toHaveProperty('refreshTokenHash');
        expect(view).not.toHaveProperty('refreshTokenFamily');
        expect(view).not.toHaveProperty('previousHashes');
        expect(view).not.toHaveProperty('userId');
      }
    });

    // ── U-AS-29 list returns [] on repo error ──
    it('returns empty array on repository error', async () => {
      mockSessionRepo.listActiveByUser.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'boom' })
      );

      const result = await service.listSessions(userIdStr, sessionIdStr);
      expect(result).toEqual([]);
    });
  });
});
