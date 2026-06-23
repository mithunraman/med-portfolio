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

  // ─── replaceNotes (ownership scoping + array-replace) ───

  describe('replaceNotes', () => {
    const now = new Date('2026-06-23T12:00:00.000Z');

    it('replaces the full notes array on an artefact owned by the user', async () => {
      const doc = await insertArtefact(model, { status: ArtefactStatus.COMPLETED });

      const result = await repo.replaceNotes(doc.xid, userId.toString(), [
        { xid: 'note_1', text: 'first', createdAt: now, updatedAt: now },
        { xid: 'note_2', text: 'second', createdAt: now, updatedAt: now },
      ]);

      expect(isOk(result)).toBe(true);

      const updated = await model.findById(doc._id).lean();
      expect(updated!.notes.map((n) => n.text)).toEqual(['first', 'second']);
      expect(updated!.notes.map((n) => n.xid)).toEqual(['note_1', 'note_2']);
    });

    it('overwrites prior notes wholesale (delete + add semantics)', async () => {
      const doc = await insertArtefact(model, { status: ArtefactStatus.IN_REVIEW });
      await repo.replaceNotes(doc.xid, userId.toString(), [
        { xid: 'old', text: 'gone', createdAt: now, updatedAt: now },
      ]);

      await repo.replaceNotes(doc.xid, userId.toString(), [
        { xid: 'new', text: 'kept', createdAt: now, updatedAt: now },
      ]);

      const updated = await model.findById(doc._id).lean();
      expect(updated!.notes.map((n) => n.xid)).toEqual(['new']);
    });

    it('clears notes when given an empty array', async () => {
      const doc = await insertArtefact(model);
      await repo.replaceNotes(doc.xid, userId.toString(), [
        { xid: 'n', text: 't', createdAt: now, updatedAt: now },
      ]);

      const result = await repo.replaceNotes(doc.xid, userId.toString(), []);

      expect(isOk(result)).toBe(true);
      const updated = await model.findById(doc._id).lean();
      expect(updated!.notes).toEqual([]);
    });

    it('does not mutate an artefact owned by another user and returns NOT_FOUND', async () => {
      const otherUserId = new Types.ObjectId();
      const doc = await insertArtefact(model, { userId: otherUserId });

      // Attacker (userId) supplies the victim's xid.
      const result = await repo.replaceNotes(doc.xid, userId.toString(), [
        { xid: 'evil', text: 'pwned', createdAt: now, updatedAt: now },
      ]);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('NOT_FOUND');

      // Victim's notes are untouched.
      const victim = await model.findById(doc._id).lean();
      expect(victim!.notes).toEqual([]);
    });

    it('returns NOT_FOUND for a tombstoned (DELETED) artefact', async () => {
      const doc = await insertArtefact(model, { status: ArtefactStatus.DELETED });

      const result = await repo.replaceNotes(doc.xid, userId.toString(), [
        { xid: 'n', text: 't', createdAt: now, updatedAt: now },
      ]);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('NOT_FOUND');
    });

    it('returns NOT_FOUND for an ARCHIVED artefact and leaves notes untouched (write-filter enforces the rule)', async () => {
      // Mirrors the archived-between-read-and-write race: the write filter excludes
      // ARCHIVED, so the mutation degrades to NOT_FOUND rather than landing.
      const doc = await insertArtefact(model, { status: ArtefactStatus.ARCHIVED });

      const result = await repo.replaceNotes(doc.xid, userId.toString(), [
        { xid: 'n', text: 'should not land', createdAt: now, updatedAt: now },
      ]);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('NOT_FOUND');

      const after = await model.findById(doc._id).lean();
      expect(after!.notes).toEqual([]);
    });
  });
});
