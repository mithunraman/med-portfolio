import { UserRole } from '@acme/shared';
import { Types } from 'mongoose';
import * as crypto from 'crypto';
import { TokenService } from '../token.service';

const userId = new Types.ObjectId();

function makeUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: userId,
    role: UserRole.USER,
    ...overrides,
  } as any;
}

describe('TokenService', () => {
  let service: TokenService;
  let signMock: jest.Mock;

  beforeEach(() => {
    signMock = jest.fn((payload: object) => `signed.${JSON.stringify(payload)}`);
    service = new TokenService({ sign: signMock } as any);
  });

  describe('U-TS-01 signAccessToken', () => {
    it('signs JWT with exactly {sub, role, sid} — no email or tokenVersion', () => {
      service.signAccessToken(makeUserDoc(), 'sess_1');

      expect(signMock).toHaveBeenCalledTimes(1);
      const payload = signMock.mock.calls[0][0];
      expect(payload).toEqual({
        sub: userId.toString(),
        role: UserRole.USER,
        sid: 'sess_1',
      });
      expect(payload).not.toHaveProperty('email');
      expect(payload).not.toHaveProperty('tokenVersion');
    });

    it('returns whatever the jwt service produced', () => {
      signMock.mockReturnValue('my.signed.token');
      expect(service.signAccessToken(makeUserDoc(), 'sess_1')).toBe('my.signed.token');
    });
  });

  describe('U-TS-02 generateRefreshToken', () => {
    it('returns base64url raw token and matching SHA-256 hash', () => {
      const { raw, hash } = service.generateRefreshToken();

      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(raw.length).toBeGreaterThanOrEqual(43); // 32 bytes → 43 b64url chars
      expect(hash).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('U-TS-03 generateRefreshToken randomness', () => {
    it('produces distinct tokens on repeated calls', () => {
      const a = service.generateRefreshToken();
      const b = service.generateRefreshToken();

      expect(a.raw).not.toBe(b.raw);
      expect(a.hash).not.toBe(b.hash);
    });
  });

  describe('U-TS-04 hashRefreshToken', () => {
    it('is deterministic for the same input', () => {
      expect(service.hashRefreshToken('abc')).toBe(service.hashRefreshToken('abc'));
    });

    it('produces different hashes for whitespace variants', () => {
      expect(service.hashRefreshToken('abc')).not.toBe(service.hashRefreshToken('abc '));
      expect(service.hashRefreshToken('abc')).not.toBe(service.hashRefreshToken(' abc'));
    });

    it('produces different hashes for case variants', () => {
      expect(service.hashRefreshToken('abc')).not.toBe(service.hashRefreshToken('ABC'));
    });
  });

  describe('U-TS-05 generateFamily', () => {
    it('returns a UUID v4 and distinct values across calls', () => {
      const a = service.generateFamily();
      const b = service.generateFamily();
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(a).toMatch(uuidV4Regex);
      expect(b).toMatch(uuidV4Regex);
      expect(a).not.toBe(b);
    });
  });
});
