import { UserRole } from '@acme/shared';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthService } from '../auth.service';

// ── Helpers ──

const oid = () => new Types.ObjectId();
const userId = oid();
const userIdStr = userId.toString();

function makeUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: userId,
    name: 'Test User',
    email: 'user@example.com',
    role: UserRole.USER,
    tokenVersion: 0,
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

// ── Mocks ──

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
};

const mockOtpService = {
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
};

function createService(): AuthService {
  return new AuthService(mockUserModel as any, mockJwtService as any, mockOtpService as any);
}

// ── Tests ──

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    mockJwtService.sign.mockReturnValue('mock.jwt.token');
    service = createService();
  });

  // ─── otpSend ───

  describe('otpSend', () => {
    it('should return isNewUser=true when email not found', async () => {
      mockOtpService.sendOtp.mockResolvedValue({ message: 'OTP sent successfully' });
      mockUserModel.findOne.mockResolvedValue(null);

      const result = await service.otpSend('new@example.com');

      expect(result).toEqual({ message: 'OTP sent successfully', isNewUser: true });
      expect(mockOtpService.sendOtp).toHaveBeenCalledWith('new@example.com');
    });

    it('should return isNewUser=false when email exists', async () => {
      mockOtpService.sendOtp.mockResolvedValue({ message: 'OTP sent successfully' });
      mockUserModel.findOne.mockResolvedValue(makeUserDoc());

      const result = await service.otpSend('user@example.com');

      expect(result).toEqual({ message: 'OTP sent successfully', isNewUser: false });
    });
  });

  // ─── otpVerifyAndLogin ───

  describe('otpVerifyAndLogin', () => {
    it('should login existing user after OTP verification', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'user@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(makeUserDoc());

      const result = await service.otpVerifyAndLogin('user@example.com', '123456');

      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith('user@example.com', '123456');
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.email).toBe('user@example.com');
      expect(mockUserModel.create).not.toHaveBeenCalled();
    });

    it('should create new user with provided name', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'new@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      const newUser = makeUserDoc({ email: 'new@example.com', name: 'Jane Doe' });
      mockUserModel.create.mockResolvedValue(newUser);

      const result = await service.otpVerifyAndLogin('new@example.com', '123456', 'Jane Doe');

      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          name: 'Jane Doe',
          role: UserRole.USER,
          tokenVersion: 0,
        })
      );
      expect(result.accessToken).toBe('mock.jwt.token');
    });

    it('should fall back to email prefix if no name provided for new user', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'new@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      const newUser = makeUserDoc({ email: 'new@example.com', name: 'new' });
      mockUserModel.create.mockResolvedValue(newUser);

      await service.otpVerifyAndLogin('new@example.com', '123456');

      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'new' })
      );
    });

    it('should propagate OTP verification errors', async () => {
      mockOtpService.verifyOtp.mockRejectedValue(new BadRequestException('Invalid OTP code.'));

      await expect(service.otpVerifyAndLogin('user@example.com', '000000')).rejects.toThrow(
        BadRequestException
      );

      expect(mockUserModel.findOne).not.toHaveBeenCalled();
    });

    it('should include tokenVersion in JWT payload', async () => {
      const userDoc = makeUserDoc({ tokenVersion: 3 });
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'user@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(userDoc);

      await service.otpVerifyAndLogin('user@example.com', '123456');

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ tokenVersion: 3 })
      );
    });

    it('should ignore name for existing users', async () => {
      const existingUser = makeUserDoc();
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'user@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(existingUser);

      await service.otpVerifyAndLogin('user@example.com', '123456', 'Different Name');

      expect(mockUserModel.create).not.toHaveBeenCalled();
      expect(existingUser.name).toBe('Test User'); // unchanged
    });
  });

  // ─── registerGuest ───

  describe('registerGuest', () => {
    it('should create a guest user without password', async () => {
      const guestDoc = makeGuestDoc();
      mockUserModel.create.mockResolvedValue(guestDoc);

      const result = await service.registerGuest();

      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Guest',
          role: UserRole.USER_GUEST,
          tokenVersion: 0,
        })
      );
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.role).toBe(UserRole.USER_GUEST);
    });

    it('should generate a unique guest email', async () => {
      const guestDoc = makeGuestDoc();
      mockUserModel.create.mockResolvedValue(guestDoc);

      await service.registerGuest();

      const createArg = mockUserModel.create.mock.calls[0][0];
      expect(createArg.email).toMatch(/^guest_.+@guest\.local$/);
    });
  });

  // ─── claimGuestAccount ───

  describe('claimGuestAccount', () => {
    it('should upgrade guest to registered user with name', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'real@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      const guestDoc = makeGuestDoc();
      mockUserModel.findById.mockResolvedValue(guestDoc);

      const result = await service.claimGuestAccount(
        userIdStr,
        'real@example.com',
        '123456',
        'Real Name'
      );

      expect(guestDoc.save).toHaveBeenCalled();
      expect(guestDoc.email).toBe('real@example.com');
      expect(guestDoc.role).toBe(UserRole.USER);
      expect(guestDoc.name).toBe('Real Name');
      expect(guestDoc.tokenVersion).toBe(1);
      expect(result.accessToken).toBe('mock.jwt.token');
    });

    it('should throw ConflictException if email already taken', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'taken@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(makeUserDoc({ email: 'taken@example.com' }));

      await expect(
        service.claimGuestAccount(userIdStr, 'taken@example.com', '123456', 'Name')
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if guest not found', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'real@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.findById.mockResolvedValue(null);

      await expect(
        service.claimGuestAccount(userIdStr, 'real@example.com', '123456', 'Name')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if user is not a guest', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'real@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.findById.mockResolvedValue(makeUserDoc());

      await expect(
        service.claimGuestAccount(userIdStr, 'real@example.com', '123456', 'Name')
      ).rejects.toThrow(BadRequestException);
    });

    it('should bump tokenVersion to invalidate old guest tokens', async () => {
      mockOtpService.verifyOtp.mockResolvedValue({ email: 'real@example.com', valid: true });
      mockUserModel.findOne.mockResolvedValue(null);
      const guestDoc = makeGuestDoc({ tokenVersion: 2 });
      mockUserModel.findById.mockResolvedValue(guestDoc);

      await service.claimGuestAccount(userIdStr, 'real@example.com', '123456', 'Name');

      expect(guestDoc.tokenVersion).toBe(3);
    });
  });

  // ─── logoutAll ───

  describe('logoutAll', () => {
    it('should increment tokenVersion', async () => {
      mockUserModel.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const result = await service.logoutAll(userIdStr);

      expect(mockUserModel.updateOne).toHaveBeenCalledWith(
        { _id: userIdStr },
        { $inc: { tokenVersion: 1 } }
      );
      expect(result).toEqual({ message: 'All sessions invalidated' });
    });
  });

  // ─── getCurrentUser ───

  describe('getCurrentUser', () => {
    it('should return auth user', async () => {
      mockUserModel.findById.mockResolvedValue(makeUserDoc());

      const result = await service.getCurrentUser(userIdStr);

      expect(result).toEqual({
        id: userIdStr,
        email: 'user@example.com',
        name: 'Test User',
        role: UserRole.USER,
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(service.getCurrentUser(userIdStr)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── generateToken ───

  describe('generateToken', () => {
    it('should include tokenVersion in payload', () => {
      const userDoc = makeUserDoc({ tokenVersion: 5 });

      service.generateToken(userDoc as any);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: userIdStr,
        email: 'user@example.com',
        role: UserRole.USER,
        tokenVersion: 5,
      });
    });

    it('should default tokenVersion to 0 if undefined', () => {
      const userDoc = makeUserDoc({ tokenVersion: undefined });

      service.generateToken(userDoc as any);

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ tokenVersion: 0 })
      );
    });
  });
});
