import { ArtefactStatus, Specialty } from '@acme/shared';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import {
  Exemption,
  OWNER_SEED_COUNT,
  OwnershipContext,
  STRANGER_SEED_COUNT,
  describeOwnershipSuite,
  ownershipSpecFactory,
} from '../../common/testing/ownership-harness';
import { isErr, isOk } from '../../common/utils/result.util';
import { ARTEFACTS_REPOSITORY } from '../artefacts.repository.interface';
import { ArtefactsRepository } from '../artefacts.repository';
import { Artefact, ArtefactDocument, ArtefactSchema } from '../schemas/artefact.schema';

/**
 * Generated ownership + blast-radius coverage for every ArtefactsRepository method.
 *
 * Complements `artefacts.repository.integration.spec.ts`, which keeps the
 * semantics this harness does not generate — tombstone behaviour on documents
 * whose `notes` array is absent, batch-partial-failure, idempotency counts.
 *
 * What this file adds is uniformity and the same-owner sibling decoy: every case
 * seeds a second artefact owned by the CALLER, so a filter that kept `userId` but
 * lost the record id fails here even though it would pass every cross-user test.
 */

const OWNER = new Types.ObjectId();
const STRANGER = new Types.ObjectId();

// Assigned in setup, read by the seed builders — which only ever run inside a
// test, long after beforeAll.
let artefactModel: Model<ArtefactDocument>;

async function seedArtefact(
  owner: Types.ObjectId,
  status: ArtefactStatus = ArtefactStatus.IN_REVIEW
): Promise<ArtefactDocument> {
  const [doc] = await artefactModel.create([
    {
      // Mirrors the production format `{userId}_{clientGeneratedId}` — see
      // Artefact.artefactId. The suffix keeps sibling seeds distinct.
      artefactId: `${owner.toHexString()}_${new Types.ObjectId().toHexString().slice(-8)}`,
      userId: owner,
      specialty: Specialty.GP,
      trainingStage: 'ST1',
      status,
      title: 'Consultation with Mrs P',
      artefactType: 'CLINICAL_CASE_REVIEW',
    },
  ]);
  return doc;
}

const NOTE = {
  xid: 'note_1',
  text: 'chase histology',
  createdAt: new Date('2026-08-23T09:00:00.000Z'),
  updatedAt: new Date('2026-08-23T09:00:00.000Z'),
};

const spec = ownershipSpecFactory<ArtefactsRepository, Types.ObjectId>();

const SPECS = [
  // ─── record axis: a record id plus the caller ───
  spec({
    method: 'findById',
    axis: 'record',
    mutates: false,
    seed: seedArtefact,
    call: (repo, target, caller) => repo.findById(target._id, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?._id.toString()).toBe(target._id.toString());
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'findByXid',
    axis: 'record',
    mutates: false,
    seed: seedArtefact,
    call: (repo, target, caller) => repo.findByXid(target.xid, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?.xid).toBe(target.xid);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    // The archive path: PATCH /artefacts/:id with status ARCHIVED reaches this
    // through ArtefactsService.archiveArtefact.
    method: 'updateArtefactById',
    label: 'archive',
    axis: 'record',
    mutates: true,
    seed: seedArtefact,
    call: (repo, target, caller) =>
      repo.updateArtefactById(target._id, caller, { status: ArtefactStatus.ARCHIVED }),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value.status).toBe(ArtefactStatus.ARCHIVED);
    },
    assertForeignResult: (result) => {
      expect(isErr(result) && result.error.code).toBe('NOT_FOUND');
    },
  }),
  spec({
    method: 'upsertReview',
    axis: 'record',
    mutates: true,
    seed: seedArtefact,
    call: (repo, target, caller) =>
      repo.upsertReview(target.xid, caller, { rating: 4, comment: null }),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value.review?.rating).toBe(4);
    },
    assertForeignResult: (result) => {
      expect(isErr(result) && result.error.code).toBe('NOT_FOUND');
    },
  }),
  spec({
    method: 'replaceNotes',
    axis: 'record',
    mutates: true,
    seed: seedArtefact,
    // The only method here taking the owner as a string rather than an ObjectId.
    call: (repo, target, caller) => repo.replaceNotes(target.xid, caller.toHexString(), [NOTE]),
    assertOwnerResult: (result) => {
      expect(isOk(result) && result.value.notes.map((note) => note.xid)).toEqual([NOTE.xid]);
    },
    assertForeignResult: (result) => {
      expect(isErr(result) && result.error.code).toBe('NOT_FOUND');
    },
  }),
  spec({
    method: 'markDeleted',
    axis: 'record',
    mutates: true,
    seed: seedArtefact,
    call: (repo, target, caller) => repo.markDeleted([target._id], caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    // Zero modified, not an error: this is a cascade primitive, and a batch that
    // matches nothing is a legitimate no-op rather than a failure.
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),

  // ─── owner axis: keyed by the owner alone ───
  spec({
    method: 'listArtefacts',
    axis: 'owner',
    mutates: false,
    seed: seedArtefact,
    call: (repo, _target, caller) => repo.listArtefacts({ userId: caller, limit: 50 }),
    assertOwnerResult: (result) => {
      // Every record the owner was seeded, and nothing of the stranger's.
      const artefacts = isOk(result) ? result.value.artefacts : [];
      expect(artefacts).toHaveLength(OWNER_SEED_COUNT);
      expect(artefacts.every((a) => a.userId.toString() === OWNER.toHexString())).toBe(true);
    },
    assertForeignResult: (result) => {
      const artefacts = isOk(result) ? result.value.artefacts : [];
      expect(artefacts).toHaveLength(STRANGER_SEED_COUNT);
      expect(artefacts.every((a) => a.userId.toString() === STRANGER.toHexString())).toBe(true);
    },
  }),
  spec({
    method: 'countByUser',
    axis: 'owner',
    mutates: false,
    seed: seedArtefact,
    call: (repo, _target, caller) => repo.countByUser(caller.toHexString()),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: OWNER_SEED_COUNT }),
    assertForeignResult: (result) =>
      expect(result).toEqual({ ok: true, value: STRANGER_SEED_COUNT }),
  }),
  spec({
    method: 'markDeletedByUserId',
    axis: 'owner',
    mutates: true,
    seed: seedArtefact,
    call: (repo, _target, caller) => repo.markDeletedByUserId(caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: OWNER_SEED_COUNT }),
    // The stranger tombstones their OWN artefact — legitimate. The harness
    // asserts the owner's records are untouched.
    assertForeignResult: (result) =>
      expect(result).toEqual({ ok: true, value: STRANGER_SEED_COUNT }),
  }),
];

const EXEMPT: Exemption[] = [
  {
    method: 'upsertArtefact',
    kind: 'payload-scoped',
    reason:
      'Create/upsert, not a read or update of an existing owned record: the owner ' +
      'arrives in the payload and is written via $setOnInsert. Its filter carries no ' +
      'userId — it matches on artefactId alone — but ownership is encoded in the key, ' +
      'which is `{userId}_{clientGeneratedId}` (Artefact.artefactId), and userId is the ' +
      'internal _id that responses never return. Two behaviours fall outside the ' +
      'record-axis protocol and so are characterised by a hand-written test in ' +
      'artefacts.repository.integration.spec.ts instead: a caller presenting an ' +
      "existing artefactId reads that artefact back, and bumps its updatedAt (Mongoose " +
      'timestamps write on every findOneAndUpdate, including a no-op upsert). No ' +
      'substantive field can be overwritten.',
  },
];

describeOwnershipSuite<ArtefactsRepository, Types.ObjectId>({
  name: 'ArtefactsRepository',
  repoClass: ArtefactsRepository,
  owner: OWNER,
  stranger: STRANGER,
  specs: SPECS,
  exempt: EXEMPT,
  setup: async (): Promise<OwnershipContext<ArtefactsRepository>> => {
    const mongod = await MongoMemoryServer.create();
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: Artefact.name, schema: ArtefactSchema }]),
      ],
      providers: [{ provide: ARTEFACTS_REPOSITORY, useClass: ArtefactsRepository }],
    }).compile();

    await module.init();
    artefactModel = module.get<Model<ArtefactDocument>>(getModelToken(Artefact.name));

    return {
      repo: module.get(ARTEFACTS_REPOSITORY),
      connection: module.get<Connection>(getConnectionToken()),
      teardown: async () => {
        await module.close();
        await mongod.stop();
      },
    };
  },
});
