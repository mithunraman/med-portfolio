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

function makeStatus(
  overrides: Partial<{ userId: string; revokedAt: Date | null; expiresAt: Date }> = {}
) {
  return {
    userId: userId.toString(),
    revokedAt: null,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

const mockSessionRepo: jest.Mocked<Pick<ISessionRepository, 'findRevocationStatus' | 'revoke'>> = {
  findRevocationStatus: jest.fn(),
  revoke: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-jwt-secret-that-is-at-least-32-chars'),
};

function createStrategy(): JwtStrategy {
  return new JwtStrategy(mockConfigService as any, mockSessionRepo as any);
}

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionRepo.revoke.mockResolvedValue(ok(undefined));
    strategy = createStrategy();
  });

  it('returns userId, role and sessionId on a valid token', async () => {
    mockSessionRepo.findRevocationStatus.mockResolvedValue(ok(makeStatus()));

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

  it('throws TOKEN_INVALID when sub is missing', async () => {
    await expect(strategy.validate({ ...makePayload(), sub: '' })).rejects.toMatchObject({
      response: { code: AuthErrorCode.TOKEN_INVALID },
    });
    expect(mockSessionRepo.findRevocationStatus).not.toHaveBeenCalled();
  });

  it('throws SESSION_NOT_FOUND when session does not exist', async () => {
    mockSessionRepo.findRevocationStatus.mockResolvedValue(ok(null));

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.SESSION_NOT_FOUND },
    });
  });

  it('throws SESSION_REVOKED when session is revoked', async () => {
    mockSessionRepo.findRevocationStatus.mockResolvedValue(
      ok(makeStatus({ revokedAt: new Date() }))
    );

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.SESSION_REVOKED },
    });
  });

  it('throws SESSION_EXPIRED when session has passed its TTL', async () => {
    mockSessionRepo.findRevocationStatus.mockResolvedValue(
      ok(makeStatus({ expiresAt: new Date(Date.now() - 1000) }))
    );

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.SESSION_EXPIRED },
    });
  });

  it('returns the role from the JWT payload (no user DB read)', async () => {
    mockSessionRepo.findRevocationStatus.mockResolvedValue(ok(makeStatus()));

    const result = await strategy.validate(makePayload({ role: UserRole.ADMIN }));

    expect(result.role).toBe(UserRole.ADMIN);
  });

  it('rejects and revokes the session when payload.sub does not match session.userId', async () => {
    const otherUser = new Types.ObjectId();
    mockSessionRepo.findRevocationStatus.mockResolvedValue(
      ok(makeStatus({ userId: otherUser.toString() }))
    );

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.TOKEN_INVALID },
    });

    expect(mockSessionRepo.revoke).toHaveBeenCalledWith(
      sessionId.toString(),
      SessionRevokedReason.SUSPICIOUS
    );
  });

  it('does not revoke when the session is already revoked (mismatch check is gated)', async () => {
    mockSessionRepo.findRevocationStatus.mockResolvedValue(
      ok(makeStatus({ revokedAt: new Date(), userId: new Types.ObjectId().toString() }))
    );

    await expect(strategy.validate(makePayload())).rejects.toMatchObject({
      response: { code: AuthErrorCode.SESSION_REVOKED },
    });

    expect(mockSessionRepo.revoke).not.toHaveBeenCalled();
  });
});
