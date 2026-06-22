import { MediaRefCollection, MediaStatus, MediaType } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { isErr, isOk } from '../../common/utils/result.util';
import { MediaRepository } from '../media.repository';
import { MEDIA_REPOSITORY } from '../media.repository.interface';
import { Media, MediaDocument, MediaSchema } from '../schemas/media.schema';

// ── Helpers ──

const userId = new Types.ObjectId();

async function insertMedia(
  model: Model<MediaDocument>,
  overrides: Partial<{
    xid: string;
    userId: Types.ObjectId;
    status: MediaStatus;
  }> = {},
) {
  const [doc] = await model.create([
    {
      xid: overrides.xid ?? `med_${new Types.ObjectId().toString().slice(-6)}`,
      userId: overrides.userId ?? userId,
      bucket: 'test-bucket',
      key: 'media/u/x.m4a',
      status: overrides.status ?? MediaStatus.PENDING,
      mediaType: MediaType.AUDIO,
      mimeType: 'audio/mp4',
    },
  ]);
  return doc;
}

// ── Test suite ──

describe('MediaRepository (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let repo: MediaRepository;
  let model: Model<MediaDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }]),
      ],
      providers: [{ provide: MEDIA_REPOSITORY, useClass: MediaRepository }],
    }).compile();

    await module.init();

    repo = module.get(MEDIA_REPOSITORY);
    model = module.get<Model<MediaDocument>>(getModelToken(Media.name));
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  // ─── updateStatus (ownership scoping) ───

  describe('updateStatus', () => {
    it('attaches media owned by the user', async () => {
      const doc = await insertMedia(model, { xid: 'med_own', status: MediaStatus.PENDING });
      const refDocumentId = new Types.ObjectId();

      const result = await repo.updateStatus('med_own', userId, {
        status: MediaStatus.ATTACHED,
        refCollection: MediaRefCollection.MESSAGES,
        refDocumentId,
        sizeBytes: 1234,
      });

      expect(isOk(result)).toBe(true);

      const updated = await model.findById(doc._id).lean();
      expect(updated!.status).toBe(MediaStatus.ATTACHED);
      expect(updated!.refCollection).toBe(MediaRefCollection.MESSAGES);
      expect(updated!.refDocumentId!.toString()).toBe(refDocumentId.toString());
      expect(updated!.sizeBytes).toBe(1234);
    });

    it('does not mutate media owned by another user and returns NOT_FOUND', async () => {
      const otherUserId = new Types.ObjectId();
      const doc = await insertMedia(model, {
        xid: 'med_victim',
        userId: otherUserId,
        status: MediaStatus.PENDING,
      });

      // Attacker (userId) supplies the victim's xid.
      const result = await repo.updateStatus('med_victim', userId, {
        status: MediaStatus.ATTACHED,
        refCollection: MediaRefCollection.MESSAGES,
        refDocumentId: new Types.ObjectId(),
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('NOT_FOUND');

      // Victim's media is untouched.
      const victim = await model.findById(doc._id).lean();
      expect(victim!.status).toBe(MediaStatus.PENDING);
      expect(victim!.refCollection).toBeNull();
    });
  });
});
