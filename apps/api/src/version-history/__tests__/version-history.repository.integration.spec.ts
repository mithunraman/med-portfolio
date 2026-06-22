import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { isOk } from '../../common/utils/result.util';
import { VersionHistoryRepository } from '../version-history.repository';
import { VERSION_HISTORY_REPOSITORY } from '../version-history.repository.interface';
import {
  VersionHistory,
  VersionHistoryDocument,
  VersionHistorySchema,
} from '../schemas/version-history.schema';

// ── Helpers ──

const ENTITY_TYPE = 'artefact' as never; // VersionHistoryEntity — string-backed
const userId = new Types.ObjectId();
const entityId = new Types.ObjectId();

async function insertVersion(
  model: Model<VersionHistoryDocument>,
  overrides: Partial<{
    userId: Types.ObjectId;
    entityId: Types.ObjectId;
    version: number;
  }> = {},
) {
  const [doc] = await model.create([
    {
      entityType: 'artefact',
      entityId: overrides.entityId ?? entityId,
      userId: overrides.userId ?? userId,
      version: overrides.version ?? 1,
      timestamp: new Date('2026-01-01'),
      snapshot: { title: 'Test' },
    },
  ]);
  return doc;
}

// ── Test suite ──

describe('VersionHistoryRepository (integration)', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let repo: VersionHistoryRepository;
  let model: Model<VersionHistoryDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: VersionHistory.name, schema: VersionHistorySchema },
        ]),
      ],
      providers: [{ provide: VERSION_HISTORY_REPOSITORY, useClass: VersionHistoryRepository }],
    }).compile();

    await module.init();

    repo = module.get(VERSION_HISTORY_REPOSITORY);
    model = module.get<Model<VersionHistoryDocument>>(getModelToken(VersionHistory.name));
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  // ─── Ownership scoping (IDOR regression) ───
  // entityId is globally unique today, but these are entity-agnostic shared reads;
  // a foreign userId must never see another user's snapshots.

  describe('findByEntity — userId scoping', () => {
    it('returns the owner\'s versions', async () => {
      await insertVersion(model, { version: 1 });
      await insertVersion(model, { version: 2 });

      const result = await repo.findByEntity(ENTITY_TYPE, entityId, userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toHaveLength(2);
    });

    it('returns empty for a different user, even on the same entityId', async () => {
      await insertVersion(model, { version: 1 });
      const otherUserId = new Types.ObjectId();

      const result = await repo.findByEntity(ENTITY_TYPE, entityId, otherUserId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toHaveLength(0);
    });
  });

  describe('findVersion — userId scoping', () => {
    it('returns null for a different user', async () => {
      await insertVersion(model, { version: 1 });
      const otherUserId = new Types.ObjectId();

      const result = await repo.findVersion(ENTITY_TYPE, entityId, otherUserId, 1);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBeNull();
    });
  });

  describe('countByEntity — userId scoping', () => {
    it('counts only the caller\'s versions', async () => {
      await insertVersion(model, { version: 1 });
      await insertVersion(model, { version: 2 });
      const otherUserId = new Types.ObjectId();

      const ownResult = await repo.countByEntity(ENTITY_TYPE, entityId, userId);
      const foreignResult = await repo.countByEntity(ENTITY_TYPE, entityId, otherUserId);

      expect(isOk(ownResult)).toBe(true);
      if (isOk(ownResult)) expect(ownResult.value).toBe(2);
      expect(isOk(foreignResult)).toBe(true);
      if (isOk(foreignResult)) expect(foreignResult.value).toBe(0);
    });
  });
});
