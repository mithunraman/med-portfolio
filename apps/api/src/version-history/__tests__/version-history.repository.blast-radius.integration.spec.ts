import { VersionHistoryEntity } from '@acme/shared';
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
import { isOk } from '../../common/utils/result.util';
import { VersionHistoryRepository } from '../version-history.repository';
import { VERSION_HISTORY_REPOSITORY } from '../version-history.repository.interface';
import {
  VersionHistory,
  VersionHistoryDocument,
  VersionHistorySchema,
} from '../schemas/version-history.schema';

/**
 * Generated ownership + blast-radius coverage for VersionHistoryRepository.
 *
 * This collection holds `snapshot` — the entire artefact body, one row per edit.
 * It is a second, uncompacted copy of every clinical entry in the system, so a
 * lost owner predicate leaks another trainee's edit history, and an erasure path
 * that under-matches leaves clinical content alive after the artefact itself has
 * been tombstoned.
 *
 * Two things distinguish it from the repositories covered so far:
 *
 * - The record key is a PAIR (`entityType` + `entityId`). A fixture using one
 *   entity type leaves the discriminator doing no work, so the seed writes a row
 *   under a second type sharing the same `entityId`.
 * - `deleteByUserId` is a real `deleteMany`, not a tombstone. Over-deletion is
 *   unrecoverable, which makes the diff's `removed` bucket the assertion that
 *   matters rather than a changed-field check.
 */

const OWNER = new Types.ObjectId();
const STRANGER = new Types.ObjectId();

/**
 * `VersionHistoryEntity` has a single member today, but `entityType` is a plain
 * string on the schema and the service is deliberately entity-agnostic — a second
 * type is anticipated, not hypothetical. Seeding one keeps the discriminator
 * load-bearing so it cannot quietly stop working before that lands.
 *
 * Honest about the stakes: entity ids are ObjectIds, so a collision between an
 * artefact and a goal is not a practical risk today. This guards correctness of a
 * shared collection, not a live leak.
 */
const OTHER_ENTITY_TYPE = 'pdp_goal';

/** Rows each seed writes: two artefact versions plus one of another entity type. */
const ROWS_PER_SEED = 3;
const ARTEFACT_VERSIONS_PER_SEED = 2;
const LATEST_VERSION = 2;

const TIMESTAMP = new Date('2026-08-23T09:00:00.000Z');

// Assigned in setup; the seed builder only ever runs inside a test.
let versionModel: Model<VersionHistoryDocument>;

interface SeededHistory {
  entityId: Types.ObjectId;
  latestVersion: number;
}

/**
 * Built through the model rather than through `createVersion`: a fixture must not
 * depend on the code under test being correct.
 *
 * `snapshot` is deliberately non-empty — `anonymizeByEntity` sets it to `{}`, and
 * an already-empty snapshot would report `modifiedCount: 0` and make that spec
 * pass without writing anything.
 */
async function seedHistory(owner: Types.ObjectId): Promise<SeededHistory> {
  const entityId = new Types.ObjectId();

  await versionModel.create([
    {
      entityType: VersionHistoryEntity.ARTEFACT,
      entityId,
      userId: owner,
      version: 1,
      timestamp: TIMESTAMP,
      snapshot: { title: 'Falls review, Mrs P', body: 'Postural drop on standing.' },
    },
    {
      entityType: VersionHistoryEntity.ARTEFACT,
      entityId,
      userId: owner,
      version: LATEST_VERSION,
      timestamp: TIMESTAMP,
      snapshot: { title: 'Falls review, Mrs P', body: 'Lying 142, standing 118. Dizzy.' },
    },
    {
      // Same entityId, different entityType — the decoy that makes the
      // discriminator load-bearing.
      entityType: OTHER_ENTITY_TYPE,
      entityId,
      userId: owner,
      version: 1,
      timestamp: TIMESTAMP,
      snapshot: { goal: 'Check postural BP before alpha-blockers' },
    },
  ]);

  return { entityId, latestVersion: LATEST_VERSION };
}

const spec = ownershipSpecFactory<VersionHistoryRepository, Types.ObjectId>();

const SPECS = [
  // ─── record axis: (entityType + entityId) plus the caller ───
  spec({
    method: 'findByEntity',
    axis: 'record',
    mutates: false,
    seed: seedHistory,
    call: (repo, target, caller) =>
      repo.findByEntity(VersionHistoryEntity.ARTEFACT, target.entityId, caller),
    assertOwnerResult: (result, target) => {
      const rows = isOk(result) ? result.value : [];
      // Length AND type: a count-only assertion would pass with `entityType`
      // dropped from the filter, since the extra row shares the entityId.
      expect(rows).toHaveLength(ARTEFACT_VERSIONS_PER_SEED);
      expect(rows.every((r) => r.entityType === VersionHistoryEntity.ARTEFACT)).toBe(true);
      expect(rows.every((r) => r.entityId.toString() === target.entityId.toString())).toBe(true);
      // Sorted newest-first.
      expect(rows.map((r) => r.version)).toEqual([2, 1]);
    },
    assertForeignResult: (result) => {
      expect(isOk(result) && result.value).toEqual([]);
    },
  }),
  spec({
    method: 'findVersion',
    axis: 'record',
    mutates: false,
    seed: seedHistory,
    call: (repo, target, caller) =>
      repo.findVersion(
        VersionHistoryEntity.ARTEFACT,
        target.entityId,
        caller,
        target.latestVersion
      ),
    assertOwnerResult: (result, target) => {
      // entityId, not just version: every seeded entity has a version 2, so a
      // version-only assertion would pass with `entityId` dropped from the filter.
      expect(isOk(result) && result.value?.entityId.toString()).toBe(target.entityId.toString());
      expect(isOk(result) && result.value?.version).toBe(target.latestVersion);
      expect(isOk(result) && result.value?.entityType).toBe(VersionHistoryEntity.ARTEFACT);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'countByEntity',
    axis: 'record',
    mutates: false,
    seed: seedHistory,
    call: (repo, target, caller) =>
      repo.countByEntity(VersionHistoryEntity.ARTEFACT, target.entityId, caller),
    assertOwnerResult: (result) =>
      expect(result).toEqual({ ok: true, value: ARTEFACT_VERSIONS_PER_SEED }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),
  spec({
    method: 'anonymizeByEntity',
    axis: 'record',
    mutates: true,
    seed: seedHistory,
    call: (repo, target, caller) =>
      repo.anonymizeByEntity(VersionHistoryEntity.ARTEFACT, [target.entityId], caller),
    // Scrubs the artefact versions only — the same-entityId row of another type
    // must be left alone, which the count pins.
    assertOwnerResult: (result) =>
      expect(result).toEqual({ ok: true, value: ARTEFACT_VERSIONS_PER_SEED }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),

  // ─── owner axis: keyed by the owner alone ───
  spec({
    // A real deleteMany, not a tombstone. The harness's `removed` bucket is what
    // detects over-deletion here; there is nothing left behind to inspect.
    method: 'deleteByUserId',
    axis: 'owner',
    mutates: true,
    seed: seedHistory,
    call: (repo, _target, caller) => repo.deleteByUserId(caller),
    assertOwnerResult: (result) =>
      expect(result).toEqual({ ok: true, value: OWNER_SEED_COUNT * ROWS_PER_SEED }),
    assertForeignResult: (result) =>
      expect(result).toEqual({ ok: true, value: STRANGER_SEED_COUNT * ROWS_PER_SEED }),
  }),
];

const EXEMPT: Exemption[] = [
  {
    method: 'createVersion',
    kind: 'payload-scoped',
    reason:
      'Insert only. The owner arrives in CreateVersionData and is written to the new ' +
      'row; no filter is applied and no existing snapshot is reachable, so there is ' +
      'nothing for an ownership predicate to scope.',
  },
];

describeOwnershipSuite<VersionHistoryRepository, Types.ObjectId>({
  name: 'VersionHistoryRepository',
  repoClass: VersionHistoryRepository,
  owner: OWNER,
  stranger: STRANGER,
  specs: SPECS,
  exempt: EXEMPT,
  setup: async (): Promise<OwnershipContext<VersionHistoryRepository>> => {
    const mongod = await MongoMemoryServer.create();
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: VersionHistory.name, schema: VersionHistorySchema },
        ]),
      ],
      providers: [{ provide: VERSION_HISTORY_REPOSITORY, useClass: VersionHistoryRepository }],
    }).compile();

    await module.init();
    versionModel = module.get<Model<VersionHistoryDocument>>(getModelToken(VersionHistory.name));

    return {
      repo: module.get(VERSION_HISTORY_REPOSITORY),
      connection: module.get<Connection>(getConnectionToken()),
      teardown: async () => {
        await module.close();
        await mongod.stop();
      },
    };
  },
});
