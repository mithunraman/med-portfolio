import { Platform, UpdateStatus } from '@acme/shared';
import { InternalServerErrorException } from '@nestjs/common';
import { err, ok } from '../../common/utils/result.util';
import { VersionPolicy } from '../schemas/version-policy.schema';
import { VersionPolicyService } from '../version-policy.service';

// ── Helpers ──

function createMockRepo() {
  return {
    findByPlatform: jest.fn().mockResolvedValue(ok(null)),
    findAll: jest.fn().mockResolvedValue(ok([])),
    upsert: jest.fn(),
  };
}

function createService(repo = createMockRepo()) {
  return { service: new VersionPolicyService(repo as any), repo };
}

function buildPolicy(overrides: Partial<VersionPolicy> = {}): VersionPolicy {
  return {
    _id: undefined as never,
    xid: 'pol_xid_001',
    platform: Platform.IOS,
    minimumVersion: '2.0.0',
    recommendedVersion: '2.5.0',
    latestVersion: '3.0.0',
    storeUrl: 'https://apps.apple.com/app/example',
    message: 'Please update',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as VersionPolicy;
}

// ── Tests ──

describe('VersionPolicyService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('evaluate', () => {
    // ── Guards ──

    it('U-VP-01: returns null when platform is undefined', async () => {
      const { service, repo } = createService();
      const result = await service.evaluate(undefined, '1.0.0');
      expect(result).toBeNull();
      expect(repo.findByPlatform).not.toHaveBeenCalled();
    });

    it('U-VP-02: returns null when clientVersion is undefined', async () => {
      const { service, repo } = createService();
      const result = await service.evaluate('ios', undefined);
      expect(result).toBeNull();
      expect(repo.findByPlatform).not.toHaveBeenCalled();
    });

    it('U-VP-03: returns null when platform is not a valid Platform enum', async () => {
      const { service, repo } = createService();
      const result = await service.evaluate('windows', '1.0.0');
      expect(result).toBeNull();
      expect(repo.findByPlatform).not.toHaveBeenCalled();
    });

    it('U-VP-04: returns null when clientVersion is not valid semver', async () => {
      const { service, repo } = createService();
      const result = await service.evaluate('ios', 'abc');
      expect(result).toBeNull();
      expect(repo.findByPlatform).not.toHaveBeenCalled();
    });

    it('U-VP-05: returns null when no policy row exists for platform', async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(ok(null));

      const result = await service.evaluate('ios', '1.0.0');

      expect(result).toBeNull();
      expect(repo.findByPlatform).toHaveBeenCalledWith(Platform.IOS);
    });

    // ── Tier branches ──

    it('U-VP-06: returns MANDATORY when clientVersion < minimumVersion', async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(ok(buildPolicy()));

      const result = await service.evaluate('ios', '1.9.9');

      expect(result).toEqual({
        status: UpdateStatus.MANDATORY,
        storeUrl: 'https://apps.apple.com/app/example',
        latestVersion: '3.0.0',
        message: 'Please update',
      });
    });

    it('U-VP-07: returns RECOMMENDED when minimum <= clientVersion < recommended', async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(ok(buildPolicy()));

      const result = await service.evaluate('ios', '2.3.0');

      expect(result).toEqual({
        status: UpdateStatus.RECOMMENDED,
        storeUrl: 'https://apps.apple.com/app/example',
        latestVersion: '3.0.0',
        message: 'Please update',
      });
    });

    it('U-VP-08: returns null when clientVersion >= recommended', async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(ok(buildPolicy()));

      const result = await service.evaluate('ios', '2.6.0');

      expect(result).toBeNull();
    });

    // ── Boundaries ──

    it('U-VP-09: clientVersion == minimumVersion is RECOMMENDED, not MANDATORY (strict <)', async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(ok(buildPolicy()));

      const result = await service.evaluate('ios', '2.0.0');

      expect(result?.status).toBe(UpdateStatus.RECOMMENDED);
    });

    it('U-VP-10: clientVersion == recommendedVersion returns null', async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(ok(buildPolicy()));

      const result = await service.evaluate('ios', '2.5.0');

      expect(result).toBeNull();
    });

    // ── Response mapping ──

    it('U-VP-12: omits message when policy.message is null', async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(ok(buildPolicy({ message: null })));

      const result = await service.evaluate('ios', '1.0.0');

      expect(result?.status).toBe(UpdateStatus.MANDATORY);
      expect(result?.message).toBeUndefined();
    });

    // ── Error path ──

    it('U-VP-13: throws InternalServerErrorException when repo returns DBError', async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(err({ code: 'DB_ERROR', message: 'boom' }));

      await expect(service.evaluate('ios', '1.0.0')).rejects.toThrow(InternalServerErrorException);
    });

    // ── Format edge: leading 'v' ──
    // Project spec says only `x.y.z` is supported, but `semver.valid('v1.0.0')`
    // is lenient and returns '1.0.0' — so a client sending `v1.0.0` is treated
    // as `1.0.0`. This documents the current runtime behavior; tightening should
    // happen at the admin write boundary (DTO regex), not here.
    it("U-VP-14: clientVersion with leading 'v' is silently coerced by semver and evaluated", async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(ok(buildPolicy()));

      const result = await service.evaluate('ios', 'v1.0.0');

      expect(repo.findByPlatform).toHaveBeenCalledWith(Platform.IOS);
      expect(result?.status).toBe(UpdateStatus.MANDATORY);
    });

    // ── Platform routing ──

    it('android client routes to android policy lookup', async () => {
      const { service, repo } = createService();
      repo.findByPlatform.mockResolvedValue(ok(null));

      await service.evaluate('android', '1.0.0');

      expect(repo.findByPlatform).toHaveBeenCalledWith(Platform.ANDROID);
    });
  });

  describe('getAll', () => {
    it('U-VP-17: returns mapped list', async () => {
      const { service, repo } = createService();
      repo.findAll.mockResolvedValue(
        ok([
          buildPolicy({ xid: 'pol_a', platform: Platform.IOS }),
          buildPolicy({ xid: 'pol_b', platform: Platform.ANDROID, message: null }),
        ])
      );

      const result = await service.getAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ xid: 'pol_a', platform: Platform.IOS });
      expect(result[1]).toMatchObject({ xid: 'pol_b', platform: Platform.ANDROID });
      expect(result[1].message).toBeUndefined();
    });

    it('U-VP-18: throws InternalServerErrorException on repo error', async () => {
      const { service, repo } = createService();
      repo.findAll.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      await expect(service.getAll()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('upsert', () => {
    it('U-VP-15: maps DTO to repo payload and returns response shape', async () => {
      const { service, repo } = createService();
      repo.upsert.mockResolvedValue(ok(buildPolicy({ xid: 'pol_new' })));

      const dto = {
        platform: Platform.IOS,
        minimumVersion: '2.0.0',
        recommendedVersion: '2.5.0',
        latestVersion: '3.0.0',
        storeUrl: 'https://apps.apple.com/app/example',
        message: 'Please update',
      };

      const result = await service.upsert(dto);

      expect(repo.upsert).toHaveBeenCalledWith({
        platform: Platform.IOS,
        minimumVersion: '2.0.0',
        recommendedVersion: '2.5.0',
        latestVersion: '3.0.0',
        storeUrl: 'https://apps.apple.com/app/example',
        message: 'Please update',
      });
      expect(result).toMatchObject({
        xid: 'pol_new',
        platform: Platform.IOS,
        minimumVersion: '2.0.0',
        recommendedVersion: '2.5.0',
        latestVersion: '3.0.0',
      });
    });

    it('U-VP-16: throws InternalServerErrorException on repo error', async () => {
      const { service, repo } = createService();
      repo.upsert.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      await expect(
        service.upsert({
          platform: Platform.IOS,
          minimumVersion: '2.0.0',
          recommendedVersion: '2.5.0',
          latestVersion: '3.0.0',
          storeUrl: 'https://apps.apple.com/app/example',
        })
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
