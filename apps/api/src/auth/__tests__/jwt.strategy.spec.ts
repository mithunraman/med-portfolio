import { UserRole } from '@acme/shared';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { JwtPayload, JwtStrategy } from '../strategies/jwt.strategy';

// ── Helpers ──

const userId = new Types.ObjectId();
const userIdStr = userId.toString();

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: userIdStr,
    email: 'user@example.com',
    role: UserRole.USER,
    tokenVersion: 0,
    ...overrides,
  };
}

function makeUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: userId,
    email: 'user@example.com',
    role: UserRole.USER,
    tokenVersion: 0,
    anonymizedAt: null,
    ...overrides,
  };
}

// ── Mocks ──

const mockLean = jest.fn();
const mockSelect = jest.fn().mockReturnValue({ lean: mockLean });
const mockFindById = jest.fn().mockReturnValue({ select: mockSelect });

const mockUserModel = { findById: mockFindById };

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-jwt-secret-that-is-at-least-32-chars'),
};

function createStrategy(): JwtStrategy {
  return new JwtStrategy(mockConfigService as any, mockUserModel as any);
}

// ── Tests ──

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindById.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ lean: mockLean });
    strategy = createStrategy();
  });

  describe('validate', () => {
    it('should return userId, email, and role from the database', async () => {
      const dbUser = makeUserDoc();
      mockLean.mockResolvedValue(dbUser);

      const result = await strategy.validate(makePayload());

      expect(result).toEqual({
        userId: userIdStr,
        email: 'user@example.com',
        role: UserRole.USER,
      });
      expect(mockFindById).toHaveBeenCalledWith(userIdStr);
      expect(mockSelect).toHaveBeenCalledWith('tokenVersion role email anonymizedAt');
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockLean.mockResolvedValue(null);

      await expect(strategy.validate(makePayload())).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });

    it('should throw UnauthorizedException when tokenVersion does not match', async () => {
      mockLean.mockResolvedValue(makeUserDoc({ tokenVersion: 2 }));

      await expect(strategy.validate(makePayload({ tokenVersion: 1 }))).rejects.toThrow(
        new UnauthorizedException('Token has been revoked'),
      );
    });

    it('should throw UnauthorizedException when user is anonymized', async () => {
      mockLean.mockResolvedValue(makeUserDoc({ anonymizedAt: new Date() }));

      await expect(strategy.validate(makePayload())).rejects.toThrow(
        new UnauthorizedException('Account is no longer active'),
      );
    });

    it('should return the database role when it differs from the JWT payload', async () => {
      mockLean.mockResolvedValue(makeUserDoc({ role: UserRole.ADMIN }));

      const result = await strategy.validate(makePayload({ role: UserRole.USER }));

      expect(result.role).toBe(UserRole.ADMIN);
    });

    it('should return the database email when it differs from the JWT payload', async () => {
      mockLean.mockResolvedValue(makeUserDoc({ email: 'updated@example.com' }));

      const result = await strategy.validate(makePayload({ email: 'old@example.com' }));

      expect(result.email).toBe('updated@example.com');
    });
  });
});
