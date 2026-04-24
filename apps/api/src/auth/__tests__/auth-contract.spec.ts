import {
  AuthErrorCode,
  LoginResponseSchema,
  RefreshTokenRequestSchema,
  RefreshTokenResponseSchema,
  SessionRevokedReason,
  SessionViewSchema,
} from '@acme/shared';

describe('Auth shared contract', () => {
  describe('U-DTO-01 SessionRevokedReason enum values', () => {
    it('matches the exact backend strings', () => {
      expect(SessionRevokedReason.LOGOUT).toBe('logout');
      expect(SessionRevokedReason.LOGOUT_ALL).toBe('logout_all');
      expect(SessionRevokedReason.ROTATION_REPLAY).toBe('rotation_replay');
      expect(SessionRevokedReason.SUPERSEDED).toBe('superseded');
    });

    it('covers exactly the four reasons in use — no stale entries', () => {
      expect(new Set(Object.values(SessionRevokedReason))).toEqual(
        new Set(['logout', 'logout_all', 'rotation_replay', 'superseded'])
      );
    });
  });

  describe('U-DTO-02 LoginResponseSchema', () => {
    it('requires both accessToken and refreshToken', () => {
      expect(() =>
        LoginResponseSchema.parse({
          accessToken: 'x',
          user: {
            id: 'u',
            email: 'e@x.com',
            name: 'n',
            role: 0,
            specialty: null,
            deletionRequestedAt: null,
            deletionScheduledFor: null,
          },
        })
      ).toThrow();
    });

    it('accepts a fully-formed payload', () => {
      const parsed = LoginResponseSchema.parse({
        accessToken: 'jwt',
        refreshToken: 'raw',
        user: {
          id: 'u',
          email: 'e@x.com',
          name: 'n',
          role: 0,
          specialty: null,
          deletionRequestedAt: null,
          deletionScheduledFor: null,
        },
      });
      expect(parsed.refreshToken).toBe('raw');
    });
  });

  describe('U-DTO-03 RefreshTokenRequestSchema', () => {
    it('rejects empty string', () => {
      expect(() => RefreshTokenRequestSchema.parse({ refreshToken: '' })).toThrow();
    });

    it('rejects missing field', () => {
      expect(() => RefreshTokenRequestSchema.parse({})).toThrow();
    });

    it('accepts a non-empty token', () => {
      expect(RefreshTokenRequestSchema.parse({ refreshToken: 'abc' })).toEqual({
        refreshToken: 'abc',
      });
    });
  });

  describe('RefreshTokenResponseSchema', () => {
    it('requires both tokens', () => {
      expect(() =>
        RefreshTokenResponseSchema.parse({ accessToken: 'x' })
      ).toThrow();
      expect(
        RefreshTokenResponseSchema.parse({ accessToken: 'a', refreshToken: 'b' })
      ).toEqual({ accessToken: 'a', refreshToken: 'b' });
    });
  });

  describe('SessionViewSchema', () => {
    it('requires id, deviceName, timestamps, and isCurrent', () => {
      expect(() => SessionViewSchema.parse({ id: 's1' })).toThrow();
      expect(
        SessionViewSchema.parse({
          id: 's1',
          deviceName: 'iOS',
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          isCurrent: true,
        })
      ).toBeDefined();
    });
  });

  describe('U-DTO-04 AuthErrorCode constants', () => {
    it('exposes every code the backend can emit', () => {
      const expected = [
        'TOKEN_EXPIRED',
        'TOKEN_INVALID',
        'SESSION_REVOKED',
        'SESSION_EXPIRED',
        'SESSION_NOT_FOUND',
        'REFRESH_INVALID',
        'REFRESH_REPLAY',
        'USER_INACTIVE',
      ];
      for (const code of expected) {
        expect(AuthErrorCode[code as keyof typeof AuthErrorCode]).toBe(code);
      }
    });
  });
});
