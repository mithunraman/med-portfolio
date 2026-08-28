import { ArtefactStatus, Specialty } from '@acme/shared';
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
const otherUserId = new Types.ObjectId();

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
      artefactType: 'CLINICAL_CASE_REVIEW',
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

  // ─── Tombstone (erasure coverage for `notes`) ───
  //
  // The tombstone scrubs note text with the all-positional operator
  // (`notes.$[].text`) rather than dropping the array, so count and timestamps
  // survive. These cases exist because that operator's behaviour — in
  // particular on an empty array — is the one assumption in the erasure path
  // that cannot be verified by reading the code.

  describe('tombstone', () => {
    const now = new Date('2026-06-23T12:00:00.000Z');

    async function insertWithNotes(status = ArtefactStatus.COMPLETED) {
      const doc = await insertArtefact(model, { status });
      await repo.replaceNotes(doc.xid, userId.toString(), [
        { xid: 'note_1', text: 'Mrs P, biopsy follow-up', createdAt: now, updatedAt: now },
        { xid: 'note_2', text: 'chase histology', createdAt: now, updatedAt: now },
      ]);
      return doc;
    }

    it('scrubs note text on markDeleted, retaining note identity and timestamps', async () => {
      const doc = await insertWithNotes();

      const result = await repo.markDeleted([doc._id], userId);
      expect(isOk(result)).toBe(true);

      const after = await model.findById(doc._id).lean();
      expect(after!.status).toBe(ArtefactStatus.DELETED);
      expect(after!.notes.map((n) => n.text)).toEqual(['[deleted]', '[deleted]']);
      expect(after!.notes.map((n) => n.xid)).toEqual(['note_1', 'note_2']);
      expect(after!.notes.map((n) => n.createdAt.toISOString())).toEqual([
        now.toISOString(),
        now.toISOString(),
      ]);
    });

    it('scrubs note text on markDeletedByUserId (the account-deletion path)', async () => {
      const doc = await insertWithNotes();

      const result = await repo.markDeletedByUserId(userId);
      expect(isOk(result)).toBe(true);

      const after = await model.findById(doc._id).lean();
      expect(after!.status).toBe(ArtefactStatus.DELETED);
      expect(after!.notes.map((n) => n.text)).toEqual(['[deleted]', '[deleted]']);
    });

    it('applies to an artefact with an empty notes array', async () => {
      const doc = await insertArtefact(model);

      const result = await repo.markDeleted([doc._id], userId);

      expect(isOk(result)).toBe(true);
      const after = await model.findById(doc._id).lean();
      expect(after!.status).toBe(ArtefactStatus.DELETED);
      expect(after!.notes).toEqual([]);
    });

    it('applies to an artefact whose `notes` field is absent entirely', async () => {
      // Inserted through the raw driver so Mongoose's `default: []` never runs —
      // the only way to build the document shape that broke the previous
      // implementation. `notes.$[].text` errored on this ("The path 'notes' must
      // exist…"), which is why the tombstone is a pipeline.
      const doc = await insertArtefact(model);
      await model.collection.updateOne({ _id: doc._id }, { $unset: { notes: '' } });
      expect(await model.collection.findOne({ _id: doc._id })).not.toHaveProperty('notes');

      const result = await repo.markDeleted([doc._id], userId);

      expect(isOk(result)).toBe(true);
      const after = await model.findById(doc._id).lean();
      expect(after!.status).toBe(ArtefactStatus.DELETED);
      expect(after!.notes).toEqual([]);
    });

    it('tombstones the whole batch even when one document lacks `notes`', async () => {
      // The regression that matters. updateMany does not roll back, so an error
      // part-way through left earlier documents tombstoned and later ones intact
      // — a silently half-erased account, and a permanently wedged cleanup cron.
      const withNotes = await insertWithNotes();
      const broken = await insertArtefact(model, { status: ArtefactStatus.IN_REVIEW });
      await model.collection.updateOne({ _id: broken._id }, { $unset: { notes: '' } });
      const trailing = await insertWithNotes(ArtefactStatus.IN_REVIEW);

      const result = await repo.markDeletedByUserId(userId);
      expect(isOk(result)).toBe(true);

      for (const id of [withNotes._id, broken._id, trailing._id]) {
        const after = await model.findById(id).lean();
        expect(after!.status).toBe(ArtefactStatus.DELETED);
        expect(after!.title).toBe('[deleted]');
        expect(after!.notes.every((n) => n.text === '[deleted]')).toBe(true);
      }
    });
  });

  // ─── Ownership scoping ───

  describe('ownership predicate', () => {
    it('markDeleted leaves another user\'s artefact untouched even when its id is in the batch', async () => {
      const mine = await insertArtefact(model);
      const theirs = await insertArtefact(model, { userId: otherUserId, title: 'Their entry' });
      const before = await model.findById(theirs._id).lean();

      const result = await repo.markDeleted([mine._id, theirs._id], userId);

      // Only the caller's entry is counted and tombstoned.
      expect(result).toEqual({ ok: true, value: 1 });
      expect((await model.findById(mine._id).lean())!.status).toBe(ArtefactStatus.DELETED);
      // Deep-equal, not a mere existence check: a survivor that kept its row but
      // lost a field would pass `toBeTruthy()`.
      expect(await model.findById(theirs._id).lean()).toEqual(before);
    });

    it('markDeleted stays idempotent — a re-run modifies nothing and changes nothing', async () => {
      const doc = await insertArtefact(model);
      await repo.markDeleted([doc._id], userId);
      const first = await model.findById(doc._id).lean();

      const second = await repo.markDeleted([doc._id], userId);

      expect(second).toEqual({ ok: true, value: 0 });
      expect(await model.findById(doc._id).lean()).toEqual(first);
    });

    it('findById does not return another user\'s artefact', async () => {
      const theirs = await insertArtefact(model, { userId: otherUserId });

      const result = await repo.findById(theirs._id, userId);

      expect(result).toEqual({ ok: true, value: null });
    });
  });

  // ─── upsertArtefact on an artefactId that already exists ───
  //
  // The only repository method whose filter carries no `userId`: it matches on
  // `artefactId` alone. Ownership is encoded in the key instead — `artefactId` is
  // `{userId}_{clientGeneratedId}` — so this sits outside the ownership-predicate
  // protocol in `artefacts.repository.blast-radius.integration.spec.ts`, which
  // exempts it and points here.
  //
  // These are characterisation tests: they pin what the method actually does to a
  // record it did not create, so the exposure is a decided position rather than an
  // assumption about how `$setOnInsert` behaves.

  describe('upsertArtefact on an existing artefactId', () => {
    const foreignPayload = (artefactId: string) => ({
      artefactId,
      userId: otherUserId,
      specialty: Specialty.PSYCHIATRY,
      trainingStage: 'ST9',
      title: 'Overwritten title',
      artefactType: 'LEADERSHIP',
    });

    it('overwrites no substantive field — $setOnInsert does not apply to a match', async () => {
      const doc = await insertArtefact(model, { title: 'Consultation with Mrs P' });

      const result = await repo.upsertArtefact(foreignPayload(doc.artefactId));

      expect(isOk(result)).toBe(true);
      const after = await model.findById(doc._id).lean();
      expect(after!.userId.toString()).toBe(userId.toString());
      expect(after!.title).toBe('Consultation with Mrs P');
      expect(after!.trainingStage).toBe('ST1');
      expect(after!.artefactType).toBe('CLINICAL_CASE_REVIEW');
      expect(after!.specialty).toBe(doc.specialty);
    });

    it('bumps updatedAt and changes nothing else', async () => {
      // Mongoose `timestamps: true` writes updatedAt on every findOneAndUpdate,
      // including a no-op upsert — so the call is not inert, and a non-owner
      // presenting a known artefactId can move another user's updatedAt.
      // Reaching it requires the victim's internal _id, which responses never
      // return (they carry xid only). Asserting updatedAt is the ONLY delta is
      // the point: if anything worse starts changing, this fails loudly.
      const doc = await insertArtefact(model);
      const raw = model.collection;
      const before = await raw.findOne({ _id: doc._id });

      await new Promise((resolve) => setTimeout(resolve, 20));
      await repo.upsertArtefact(foreignPayload(doc.artefactId));

      const after = await raw.findOne({ _id: doc._id });
      const changed = [...new Set([...Object.keys(before!), ...Object.keys(after!)])].filter(
        (key) => JSON.stringify(before![key]) !== JSON.stringify(after![key])
      );

      expect(changed).toEqual(['updatedAt']);
    });

    it('returns the existing artefact to a caller who is not its owner', async () => {
      // Documents the read-back: the guard is the unguessability of artefactId,
      // not the filter. Recorded so a future reader weighs that deliberately.
      const doc = await insertArtefact(model, { title: 'Consultation with Mrs P' });

      const result = await repo.upsertArtefact(foreignPayload(doc.artefactId));

      expect(isOk(result) && result.value._id.toString()).toBe(doc._id.toString());
      expect(isOk(result) && result.value.userId.toString()).toBe(userId.toString());
    });
  });
});
