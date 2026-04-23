import { Platform } from '@acme/shared';
import { isErr, isOk } from '../../common/utils/result.util';
import { VersionPolicy } from '../schemas/version-policy.schema';
import { VersionPolicyRepository } from '../version-policy.repository';

// ── Helpers ──

function leanResolve<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function leanReject(error: unknown) {
  return { lean: jest.fn().mockRejectedValue(error) };
}

function createMockModel() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
}

function buildPolicyDoc(overrides: Partial<VersionPolicy> = {}): VersionPolicy {
  return {
    _id: undefined as never,
    xid: 'pol_xid_001',
    platform: Platform.IOS,
    minimumVersion: '2.0.0',
    recommendedVersion: '2.5.0',
    latestVersion: '3.0.0',
    storeUrl: 'https://apps.apple.com/app/example',
    message: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as VersionPolicy;
}

// ── Tests ──

describe('VersionPolicyRepository', () => {
  let model: ReturnType<typeof createMockModel>;
  let repo: VersionPolicyRepository;

  beforeEach(() => {
    model = createMockModel();
    repo = new VersionPolicyRepository(model as any);
  });

  describe('findByPlatform', () => {
    it('U-R-01: returns ok(doc) when findOne resolves', async () => {
      const doc = buildPolicyDoc();
      model.findOne.mockReturnValue(leanResolve(doc));

      const result = await repo.findByPlatform(Platform.IOS);

      expect(model.findOne).toHaveBeenCalledWith({ platform: Platform.IOS });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toEqual(doc);
    });

    it('returns ok(null) when no document matches', async () => {
      model.findOne.mockReturnValue(leanResolve(null));

      const result = await repo.findByPlatform(Platform.ANDROID);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBeNull();
    });

    it('U-R-02: returns err on throw', async () => {
      model.findOne.mockReturnValue(leanReject(new Error('boom')));

      const result = await repo.findByPlatform(Platform.IOS);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('DB_ERROR');
    });
  });

  describe('findAll', () => {
    it('returns ok(docs) when find resolves', async () => {
      const docs = [buildPolicyDoc({ xid: 'a' }), buildPolicyDoc({ xid: 'b' })];
      model.find.mockReturnValue(leanResolve(docs));

      const result = await repo.findAll();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toHaveLength(2);
    });

    it('returns err on throw', async () => {
      model.find.mockReturnValue(leanReject(new Error('boom')));

      const result = await repo.findAll();

      expect(isErr(result)).toBe(true);
    });
  });

  describe('upsert', () => {
    it('U-R-03: uses $setOnInsert for xid and $set for the rest, with upsert/new flags', async () => {
      const doc = buildPolicyDoc();
      model.findOneAndUpdate.mockReturnValue(leanResolve(doc));

      const data = {
        platform: Platform.IOS,
        minimumVersion: '2.0.0',
        recommendedVersion: '2.5.0',
        latestVersion: '3.0.0',
        storeUrl: 'https://apps.apple.com/app/example',
        message: 'Please update',
      };

      await repo.upsert(data);

      expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter, update, options] = model.findOneAndUpdate.mock.calls[0];

      expect(filter).toEqual({ platform: Platform.IOS });
      expect(update.$set).toEqual(data);
      expect(update.$setOnInsert).toBeDefined();
      expect(typeof update.$setOnInsert.xid).toBe('string');
      expect(update.$setOnInsert.xid.length).toBeGreaterThan(0);
      expect(options).toEqual({ upsert: true, new: true, setDefaultsOnInsert: true });
    });

    it('returns err on throw', async () => {
      model.findOneAndUpdate.mockReturnValue(leanReject(new Error('boom')));

      const result = await repo.upsert({
        platform: Platform.IOS,
        minimumVersion: '2.0.0',
        recommendedVersion: '2.5.0',
        latestVersion: '3.0.0',
        storeUrl: 'https://apps.apple.com/app/example',
      });

      expect(isErr(result)).toBe(true);
    });
  });
});
