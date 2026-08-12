import { MediaRefCollection, MediaStatus, MediaType } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { UNREDACTED_RETENTION_MS } from '../../common/retention.constants';
import { StorageService } from '../../storage/storage.service';
import { MediaSweeperService } from '../media-sweeper.service';
import { MediaRepository } from '../media.repository';
import { MEDIA_REPOSITORY } from '../media.repository.interface';
import { Media, MediaDocument, MediaSchema } from '../schemas/media.schema';

/**
 * Launch condition **C-3** — audio deleted within the retention window.
 *
 * Exercises the whole arc in one `runSweep()`: mark by age → delete the object →
 * flip to DELETED. That end-to-end shape is the point. Marking and deleting were
 * separate concerns before this condition, and the thing that was missing was
 * never the deletion — it was anything that marked audio because time had passed.
 */

const NOW = new Date('2026-08-06T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

interface Seed {
  status?: MediaStatus;
  mediaType?: MediaType;
  createdAt?: Date;
  deleteAttempts?: number;
  refCollection?: MediaRefCollection | null;
}

describe('Audio retention sweep (C-3) — integration', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let sweeper: MediaSweeperService;
  let model: Model<MediaDocument>;
  let deleteObject: jest.Mock;
  let seq = 0;

  async function seed(overrides: Seed = {}): Promise<MediaDocument> {
    const [doc] = await model.create([
      {
        xid: `med_${seq++}`,
        userId: new Types.ObjectId(),
        bucket: 'logdit-media',
        key: `media/u/${seq}.m4a`,
        status: overrides.status ?? MediaStatus.ATTACHED,
        mediaType: overrides.mediaType ?? MediaType.AUDIO,
        mimeType: 'audio/mp4',
        refCollection:
          overrides.refCollection === undefined
            ? MediaRefCollection.MESSAGES
            : overrides.refCollection,
        refDocumentId: new Types.ObjectId(),
        deleteAttempts: overrides.deleteAttempts ?? 0,
        createdAt: overrides.createdAt ?? hoursAgo(49),
      },
    ]);
    return doc;
  }

  const reload = (doc: MediaDocument) => model.findById(doc._id).lean().exec();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    deleteObject = jest.fn().mockResolvedValue(undefined);
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }]),
      ],
      providers: [
        MediaSweeperService,
        { provide: MEDIA_REPOSITORY, useClass: MediaRepository },
        { provide: StorageService, useValue: { deleteObject } },
      ],
    }).compile();

    sweeper = module.get(MediaSweeperService);
    model = module.get<Model<MediaDocument>>(getModelToken(Media.name));
  }, 30000);

  afterAll(async () => {
    await module?.close();
    await mongod?.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
    deleteObject.mockClear();
  });

  describe('end to end', () => {
    it('marks, deletes the object and flips to DELETED within a single tick', async () => {
      // Worst-case retention is therefore the window plus one hour of tick
      // granularity — not two, which is what sweeping before marking would give.
      //
      // Seeded against the real clock rather than NOW: runSweep() takes no time
      // argument (it is the cron entry point), and freezing the system clock
      // with fake timers deadlocks the Mongo driver's internal timers.
      const doc = await seed({ createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) });

      await sweeper.runSweep();

      expect(deleteObject).toHaveBeenCalledWith('logdit-media', doc.key);
      expect((await reload(doc))!.status).toBe(MediaStatus.DELETED);
    });
  });

  describe('what gets expired', () => {
    it('marks ATTACHED audio past the window', async () => {
      const doc = await seed({ status: MediaStatus.ATTACHED });

      expect(await sweeper.expireAudio(NOW)).toBe(1);

      const after = await reload(doc);
      expect(after!.status).toBe(MediaStatus.PENDING_DELETE);
      expect(after!.pendingDeleteAt).toBeTruthy();
    });

    it('marks PENDING audio too — an orphaned upload nothing else would ever delete', async () => {
      const doc = await seed({ status: MediaStatus.PENDING, refCollection: null });

      expect(await sweeper.expireAudio(NOW)).toBe(1);

      expect((await reload(doc))!.status).toBe(MediaStatus.PENDING_DELETE);
    });

    it('leaves audio inside the window alone', async () => {
      const doc = await seed({ createdAt: hoursAgo(47) });

      expect(await sweeper.expireAudio(NOW)).toBe(0);

      expect((await reload(doc))!.status).toBe(MediaStatus.ATTACHED);
    });

    it('expires exactly at the window boundary and not a moment before', async () => {
      const justInside = await seed({
        createdAt: new Date(NOW.getTime() - UNREDACTED_RETENTION_MS + 1000),
      });
      const justOutside = await seed({
        createdAt: new Date(NOW.getTime() - UNREDACTED_RETENTION_MS - 1000),
      });

      expect(await sweeper.expireAudio(NOW)).toBe(1);

      expect((await reload(justInside))!.status).toBe(MediaStatus.ATTACHED);
      expect((await reload(justOutside))!.status).toBe(MediaStatus.PENDING_DELETE);
    });
  });

  describe('what is deliberately out of reach', () => {
    it('never touches non-audio media, however old', async () => {
      // MediaRefCollection declares PROFILES and ARTEFACTS. Neither is written
      // today, but without the mediaType clause a future profile avatar would
      // silently start evaporating after 48 hours.
      const image = await seed({ mediaType: MediaType.IMAGE, createdAt: hoursAgo(500) });
      const document = await seed({ mediaType: MediaType.DOCUMENT, createdAt: hoursAgo(500) });

      expect(await sweeper.expireAudio(NOW)).toBe(0);

      expect((await reload(image))!.status).toBe(MediaStatus.ATTACHED);
      expect((await reload(document))!.status).toBe(MediaStatus.ATTACHED);
    });

    it('does not resurrect a dead-lettered row', async () => {
      const dead = await seed({
        status: MediaStatus.PENDING_DELETE,
        deleteAttempts: 24,
        createdAt: hoursAgo(500),
      });

      expect(await sweeper.expireAudio(NOW)).toBe(0);
      await sweeper.sweep();

      expect(deleteObject).not.toHaveBeenCalled();
      expect((await reload(dead))!.status).toBe(MediaStatus.PENDING_DELETE);
    });

    it('does not re-mark an already DELETED row', async () => {
      const gone = await seed({ status: MediaStatus.DELETED, createdAt: hoursAgo(500) });

      expect(await sweeper.expireAudio(NOW)).toBe(0);

      expect((await reload(gone))!.status).toBe(MediaStatus.DELETED);
    });
  });

  describe('idempotency', () => {
    it('a second expiry pass marks nothing — the query excludes its own output', async () => {
      await seed();

      expect(await sweeper.expireAudio(NOW)).toBe(1);
      expect(await sweeper.expireAudio(NOW)).toBe(0);
    });
  });
});
