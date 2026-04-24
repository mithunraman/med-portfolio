import { AuthErrorCode, SessionRevokedReason, UserRole } from '@acme/shared';
import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ok } from '../../common/utils/result.util';
import { ISessionRepository } from '../sessions.repository.interface';
import { JwtPayload, JwtStrategy } from '../strategies/jwt.strategy';

const userId = new Types.ObjectId();
const sessionId = new Types.ObjectId();

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: userId.toString(),
    role: UserRole.USER,
    sid: sessionId.toString(),
    ...overrides,
  };
}

function makeUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: userId,
    role: UserRole.USER,
    anonymizedAt: null,
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    _id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  } as any;
}

const mockLean = jest.fn();
const mockSelect = jest.fn().mockReturnValue({ lean: mockLean });
const mockUserModel = { findById: jest.fn().mockReturnValue({ select: mockSelect }) };

const mockSessionRepo: jest.Mocked<Pick<ISessionRepository, 'findById'>> = {
  findById: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-jwt-secret-that-is-at-least-32-chars'),
};

function createStrategy(): JwtStrategy {
  return new JwtStrategy(
    mockConfigService as any,
    mockUserModel as any,
    mockSessionRepo as any
  );
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserModel.findById.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ lean: mockLean });
    strategy = createStrategy();
  });

  it('returns userId, role and sessionId on a valid token', async () => {
    mockLean.mockResolvedValue(makeUserDoc());
    mockSessionRepo.findById.mockResolvedValue(ok(makeSession()));

    const result = await strategy.validate(makePayload());

    expect(result).toEqual({
      userId: userId.toString(),
      role: UserRole.USER,
      sessionId: sessionId.toString(),
    });
  });

  it('throws TOKEN_INVALID when sid is missing', async () => {
    await expect(strategy.validate({ ...makePayload(), sid: '' })).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('throws USER_INACTIVE when user is not found', async () => {
    mockLean.mockResolvedValue(null);
    mockSessionRepo.findById.mockResolvedValue(ok(makeSession()));

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.USER_INACTIVE },
    });
  });

  it('throws USER_INACTIVE when user is anonymized', async () => {
    mockLean.mockResolvedValue(makeUserDoc({ anonymizedAt: new Date() }));
    mockSessionRepo.findById.mockResolvedValue(ok(makeSession()));

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.USER_INACTIVE },
    });
  });

  it('throws SESSION_NOT_FOUND when session does not exist', async () => {
    mockLean.mockResolvedValue(makeUserDoc());
    mockSessionRepo.findById.mockResolvedValue(ok(null));

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.SESSION_NOT_FOUND },
    });
  });

  it('throws SESSION_REVOKED when session is revoked', async () => {
    mockLean.mockResolvedValue(makeUserDoc());
    mockSessionRepo.findById.mockResolvedValue(
      ok(makeSession({ revokedAt: new Date(), revokedReason: SessionRevokedReason.LOGOUT }))
    );

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.SESSION_REVOKED },
    });
  });

  it('throws SESSION_EXPIRED when session has passed its TTL', async () => {
    mockLean.mockResolvedValue(makeUserDoc());
    mockSessionRepo.findById.mockResolvedValue(
      ok(makeSession({ expiresAt: new Date(Date.now() - 1000) }))
    );

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.SESSION_EXPIRED },
    });
  });
});
