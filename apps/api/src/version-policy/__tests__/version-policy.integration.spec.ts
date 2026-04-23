import { Platform, UpdateStatus } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import {
  VersionPolicy,
  VersionPolicyDocument,
  VersionPolicySchema,
} from '../schemas/version-policy.schema';
import { VersionPolicyRepository } from '../version-policy.repository';
import { VersionPolicyService } from '../version-policy.service';

describe('VersionPolicy (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let service: VersionPolicyService;
  let model: Model<VersionPolicyDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: VersionPolicy.name, schema: VersionPolicySchema },
        ]),
      ],
      providers: [VersionPolicyRepository, VersionPolicyService],
    }).compile();

    await module.init();

    service = module.get(VersionPolicyService);
    model = module.get<Model<VersionPolicyDocument>>(getModelToken(VersionPolicy.name));
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  // ─────────────────────────────────────────────────────
  // upsert + xid stability
  // ─────────────────────────────────────────────────────

  describe('upsert', () => {
    const baseDto = {
      platform: Platform.IOS,
      minimumVersion: '2.0.0',
      recommendedVersion: '2.5.0',
      latestVersion: '3.0.0',
      storeUrl: 'https://apps.apple.com/app/example',
      message: 'Initial copy',
    };

    it('I-VP-01: creates new row on first call with generated xid', async () => {
      const before = await model.countDocuments();
      expect(before).toBe(0);

      const result = await service.upsert(baseDto);

      expect(result.xid).toBeDefined();
      expect(result.xid.length).toBeGreaterThan(0);
      expect(result.platform).toBe(Platform.IOS);

      const after = await model.find().lean();
      expect(after).toHaveLength(1);
      expect(after[0].xid).toBe(result.xid);
      expect(after[0].minimumVersion).toBe('2.0.0');
    });

    it('I-VP-02: updates existing row without changing xid', async () => {
      const first = await service.upsert(baseDto);

      const second = await service.upsert({
        ...baseDto,
        minimumVersion: '2.1.0',
        recommendedVersion: '2.6.0',
        latestVersion: '3.1.0',
        message: 'Updated copy',
      });

      expect(second.xid).toBe(first.xid);
      expect(second.minimumVersion).toBe('2.1.0');
      expect(second.recommendedVersion).toBe('2.6.0');
      expect(second.message).toBe('Updated copy');

      const all = await model.find().lean();
      expect(all).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────
  // platform uniqueness (data integrity)
  // ─────────────────────────────────────────────────────

  describe('platform uniqueness', () => {
    it('I-VP-08: raw create for duplicate platform fails (unique index)', async () => {
      await service.upsert({
        platform: Platform.IOS,
        minimumVersion: '2.0.0',
        recommendedVersion: '2.5.0',
        latestVersion: '3.0.0',
        storeUrl: 'https://apps.apple.com/app/example',
      });

      await expect(
        model.create({
          xid: 'manual_xid',
          platform: Platform.IOS,
          minimumVersion: '2.0.1',
          recommendedVersion: '2.5.1',
          latestVersion: '3.0.1',
          storeUrl: 'https://apps.apple.com/app/example2',
        })
      ).rejects.toThrow(/duplicate key/i);
    });

    it('I-X-06: platform unique index exists', async () => {
      const indexes = await model.collection.indexes();
      const platformIndex = indexes.find(
        (i) => i.key.platform === 1 && i.unique === true
      );
      expect(platformIndex).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────
  // getAll
  // ─────────────────────────────────────────────────────

  describe('getAll', () => {
    it('I-VP-07: returns all rows', async () => {
      await service.upsert({
        platform: Platform.IOS,
        minimumVersion: '2.0.0',
        recommendedVersion: '2.5.0',
        latestVersion: '3.0.0',
        storeUrl: 'https://apps.apple.com/app/ios',
      });
      await service.upsert({
        platform: Platform.ANDROID,
        minimumVersion: '2.0.0',
        recommendedVersion: '2.5.0',
        latestVersion: '3.0.0',
        storeUrl: 'https://play.google.com/app/android',
      });

      const result = await service.getAll();

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.platform).sort()).toEqual([Platform.ANDROID, Platform.IOS]);
    });

    it('returns empty array when no policies exist', async () => {
      const result = await service.getAll();
      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────
  // evaluate against real DB
  // ─────────────────────────────────────────────────────

  describe('evaluate', () => {
    beforeEach(async () => {
      await service.upsert({
        platform: Platform.IOS,
        minimumVersion: '2.0.0',
        recommendedVersion: '2.5.0',
        latestVersion: '3.0.0',
        storeUrl: 'https://apps.apple.com/app/example',
        message: 'Update available',
      });
    });

    it('I-VP-09: returns MANDATORY when client below minimum', async () => {
      const result = await service.evaluate('ios', '1.0.0');

      expect(result).toEqual({
        status: UpdateStatus.MANDATORY,
        storeUrl: 'https://apps.apple.com/app/example',
        latestVersion: '3.0.0',
        message: 'Update available',
      });
    });

    it('returns RECOMMENDED when between minimum and recommended', async () => {
      const result = await service.evaluate('ios', '2.3.0');
      expect(result?.status).toBe(UpdateStatus.RECOMMENDED);
    });

    it('I-VP-10: returns null when client up to date', async () => {
      const result = await service.evaluate('ios', '2.5.0');
      expect(result).toBeNull();
    });

    it('I-VP-12: returns null when platform/appVersion are missing', async () => {
      expect(await service.evaluate(undefined, '2.0.0')).toBeNull();
      expect(await service.evaluate('ios', undefined)).toBeNull();
    });

    it('returns null when no policy exists for the requested platform', async () => {
      const result = await service.evaluate('android', '1.0.0');
      expect(result).toBeNull();
    });
  });
});
