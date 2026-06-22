import { ArtefactStatus } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { isErr, isOk } from '../../common/utils/result.util';
import { ARTEFACTS_REPOSITORY } from '../artefacts.repository.interface';
import { ArtefactsRepository } from '../artefacts.repository';
import { Artefact, ArtefactDocument, ArtefactSchema } from '../schemas/artefact.schema';

// ── Helpers ──

const userId = new Types.ObjectId();

async function insertArtefact(
  model: Model<ArtefactDocument>,
  overrides: Partial<{
    userId: Types.ObjectId;
    status: ArtefactStatus;
    title: string;
  }> = {},
) {
  const [doc] = await model.create([
    {
      artefactId: `${(overrides.userId ?? userId).toString()}_${new Types.ObjectId().toString().slice(-6)}`,
      userId: overrides.userId ?? userId,
      trainingStage: 'ST1',
      status: overrides.status ?? ArtefactStatus.IN_REVIEW,
      title: overrides.title ?? 'Test Artefact',
    },
  ]);
  return doc;
}

// ── Test suite ──

describe('ArtefactsRepository (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let repo: ArtefactsRepository;
  let model: Model<ArtefactDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Artefact.name, schema: ArtefactSchema }]),
      ],
      providers: [{ provide: ARTEFACTS_REPOSITORY, useClass: ArtefactsRepository }],
    }).compile();

    await module.init();

    repo = module.get(ARTEFACTS_REPOSITORY);
    model = module.get<Model<ArtefactDocument>>(getModelToken(Artefact.name));
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  // ─── updateArtefactById (ownership scoping) ───

  describe('updateArtefactById', () => {
    it('updates an artefact owned by the user', async () => {
      const doc = await insertArtefact(model, { status: ArtefactStatus.IN_REVIEW });

      const result = await repo.updateArtefactById(doc._id, userId, {
        status: ArtefactStatus.COMPLETED,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value.status).toBe(ArtefactStatus.COMPLETED);

      const updated = await model.findById(doc._id).lean();
      expect(updated!.status).toBe(ArtefactStatus.COMPLETED);
    });

    it('does not mutate an artefact owned by another user and returns NOT_FOUND', async () => {
      const otherUserId = new Types.ObjectId();
      const doc = await insertArtefact(model, {
        userId: otherUserId,
        status: ArtefactStatus.IN_REVIEW,
      });

      // Attacker (userId) supplies the victim's internal _id.
      const result = await repo.updateArtefactById(doc._id, userId, {
        status: ArtefactStatus.ARCHIVED,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('NOT_FOUND');

      // Victim's artefact is untouched.
      const victim = await model.findById(doc._id).lean();
      expect(victim!.status).toBe(ArtefactStatus.IN_REVIEW);
    });
  });
});
