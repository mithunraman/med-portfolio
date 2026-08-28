import { ArtefactStatus, PdpGoalStatus } from '@acme/shared';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import {
  Exemption,
  OWNER_SEED_COUNT,
  OwnershipContext,
  STRANGER_SEED_COUNT,
  describeOwnershipSuite,
  ownershipSpecFactory,
} from '../../common/testing/ownership-harness';
import { isErr, isOk } from '../../common/utils/result.util';
import { PdpGoalsRepository } from '../pdp-goals.repository';
import { PDP_GOALS_REPOSITORY } from '../pdp-goals.repository.interface';
import {
  PdpGoal,
  PdpGoalDocument,
  PdpGoalLinkSource,
  PdpGoalSchema,
} from '../schemas/pdp-goal.schema';

/**
 * Generated ownership + blast-radius coverage for every PdpGoalsRepository method.
 *
 * Complements `pdp-goals.repository.integration.spec.ts`, which keeps the
 * semantics this harness does not generate — the inert `linkedBy` / `$size`
 * clauses in `proposalFilter`, cursor behaviour, tombstone field coverage.
 *
 * Three things here that artefacts did not exercise: an aggregation with a
 * `$lookup` across collections, a hard `deleteMany`, and private helpers that
 * exist on the prototype and so must be accounted for as exemptions.
 */

const OWNER = new Types.ObjectId();
const STRANGER = new Types.ObjectId();

// Assigned in setup; the seed builder only ever runs inside a test.
let pdpGoalModel: Model<PdpGoalDocument>;

interface SeededGoal {
  goal: PdpGoalDocument;
  /** The artefact this goal cites — the key most record-axis methods take. */
  artefactId: Types.ObjectId;
}

/**
 * Seeds a goal in the shape `proposalFilter` recognises: status PROPOSED, exactly
 * one link, created by analysis. Two specs depend on that precisely — a fixture
 * that drifts from it would make them pass without testing anything.
 *
 * Built through the models rather than through `repo.create()` on purpose: a
 * fixture must not depend on the code under test being correct, or a bug in
 * `create` produces malformed fixtures that every downstream spec then agrees with.
 *
 * The artefact is written raw for the same reason the existing integration spec
 * does it — the `$lookup` joins the collection directly, and registering the whole
 * Artefact schema here would pull in far more than the join needs.
 */
async function seedGoal(owner: Types.ObjectId): Promise<SeededGoal> {
  const artefactId = new Types.ObjectId();

  await pdpGoalModel.db.collection('artefacts').insertOne({
    _id: artefactId,
    userId: owner,
    xid: nanoidAlphanumeric(),
    title: 'Falls review, Mrs P',
    status: ArtefactStatus.COMPLETED,
  });

  const [goal] = await pdpGoalModel.create([
    {
      xid: nanoidAlphanumeric(),
      userId: owner,
      goal: 'Check postural BP before adding an alpha-blocker in the over-65s',
      links: [{ artefactId, linkedAt: new Date(), linkedBy: PdpGoalLinkSource.ANALYSIS }],
      status: PdpGoalStatus.PROPOSED,
      actions: [
        {
          xid: nanoidAlphanumeric(),
          action: 'Read the STOPP/START criteria',
          intendedEvidence: 'Reflection in next entry',
          status: PdpGoalStatus.PROPOSED,
        },
      ],
    },
  ]);

  return { goal, artefactId };
}

const PROPOSED = [PdpGoalStatus.PROPOSED];

const spec = ownershipSpecFactory<PdpGoalsRepository, Types.ObjectId>();

const SPECS = [
  // ─── record axis: a record key plus the caller ───
  spec({
    method: 'findByArtefactIds',
    axis: 'record',
    mutates: false,
    seed: seedGoal,
    call: (repo, target, caller) => repo.findByArtefactIds([target.artefactId], caller),
    assertOwnerResult: (result, target) => {
      const goals = isOk(result) ? result.value.get(target.artefactId.toString()) : undefined;
      expect(goals?.map((g) => g.xid)).toEqual([target.goal.xid]);
    },
    assertForeignResult: (result) => {
      expect(isOk(result) && result.value.size).toBe(0);
    },
  }),
  spec({
    method: 'findByArtefactId',
    axis: 'record',
    mutates: false,
    seed: seedGoal,
    call: (repo, target, caller) => repo.findByArtefactId(target.artefactId, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value.map((g) => g.xid)).toEqual([target.goal.xid]);
    },
    assertForeignResult: (result) => {
      expect(isOk(result) && result.value).toEqual([]);
    },
  }),
  spec({
    // Aggregation with a $lookup into the artefacts collection. The leak surface
    // is the projection rather than a write, so the owner assertion checks what
    // came back as well as that nothing changed.
    method: 'findOneWithArtefacts',
    axis: 'record',
    mutates: false,
    seed: seedGoal,
    call: (repo, target, caller) => repo.findOneWithArtefacts(target.goal.xid, caller),
    assertOwnerResult: (result, target) => {
      expect(isOk(result) && result.value?.xid).toBe(target.goal.xid);
      expect(isOk(result) && result.value?.linkedArtefacts).toHaveLength(1);
    },
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: null }),
  }),
  spec({
    method: 'saveGoal',
    axis: 'record',
    mutates: true,
    seed: seedGoal,
    call: (repo, target, caller) =>
      repo.saveGoal(target.goal.xid, caller, { status: PdpGoalStatus.STARTED }),
    assertOwnerResult: (result) => expect(isOk(result)).toBe(true),
    assertForeignResult: (result) => {
      expect(isErr(result) && result.error.code).toBe('NOT_FOUND');
    },
  }),
  spec({
    // Writes goal fields and every action status in one update, guarded by
    // `proposalFilter`. The decline path (no per-action selections) is used here.
    method: 'updateProposalForArtefact',
    label: 'decline',
    axis: 'record',
    mutates: true,
    seed: seedGoal,
    call: (repo, target, caller) =>
      repo.updateProposalForArtefact(target.goal.xid, caller, target.artefactId, {
        status: PdpGoalStatus.ARCHIVED,
      }),
    assertOwnerResult: (result) => expect(isOk(result)).toBe(true),
    assertForeignResult: (result) => {
      expect(isErr(result) && result.error.code).toBe('NOT_FOUND');
    },
  }),
  spec({
    // The only hard delete across the content repositories — over-deletion shows
    // up in the diff's `removed` bucket rather than as a changed document.
    method: 'deleteUnadoptedProposals',
    axis: 'record',
    mutates: true,
    seed: seedGoal,
    call: (repo, target, caller) => repo.deleteUnadoptedProposals([target.artefactId], caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: 1 }),
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: 0 }),
  }),
  spec({
    method: 'anonymizeGoal',
    axis: 'record',
    mutates: true,
    seed: seedGoal,
    call: (repo, target, caller) => repo.anonymizeGoal(target.goal.xid, caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: true }),
    // `false`, not NOT_FOUND — unlike its sibling `saveGoal`. Detectable by the
    // caller, so not a silent no-op, but inconsistent; recorded here rather than
    // changed.
    assertForeignResult: (result) => expect(result).toEqual({ ok: true, value: false }),
  }),

  // ─── owner axis: keyed by the owner alone ───
  spec({
    method: 'findByUserId',
    axis: 'owner',
    mutates: false,
    seed: seedGoal,
    call: (repo, _target, caller) => repo.findByUserId(caller, PROPOSED),
    assertOwnerResult: (result) => {
      const goals = isOk(result) ? result.value : [];
      expect(goals).toHaveLength(OWNER_SEED_COUNT);
      expect(goals.every((g) => g.userId.toString() === OWNER.toHexString())).toBe(true);
    },
    assertForeignResult: (result) => {
      const goals = isOk(result) ? result.value : [];
      expect(goals).toHaveLength(STRANGER_SEED_COUNT);
      expect(goals.every((g) => g.userId.toString() === STRANGER.toHexString())).toBe(true);
    },
  }),
  spec({
    method: 'findPaginated',
    axis: 'owner',
    mutates: false,
    seed: seedGoal,
    call: (repo, _target, caller) => repo.findPaginated(caller, PROPOSED),
    assertOwnerResult: (result) => {
      const page = isOk(result) ? result.value : { items: [], nextCursor: null };
      expect(page.items).toHaveLength(OWNER_SEED_COUNT);
      expect(page.items.every((g) => g.userId.toString() === OWNER.toHexString())).toBe(true);
    },
    assertForeignResult: (result) => {
      const page = isOk(result) ? result.value : { items: [], nextCursor: null };
      expect(page.items).toHaveLength(STRANGER_SEED_COUNT);
      expect(page.items.every((g) => g.userId.toString() === STRANGER.toHexString())).toBe(true);
    },
  }),
  spec({
    method: 'countByUserId',
    axis: 'owner',
    mutates: false,
    seed: seedGoal,
    call: (repo, _target, caller) => repo.countByUserId(caller, PROPOSED),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: OWNER_SEED_COUNT }),
    assertForeignResult: (result) =>
      expect(result).toEqual({ ok: true, value: STRANGER_SEED_COUNT }),
  }),
  spec({
    method: 'markDeletedByUserId',
    axis: 'owner',
    mutates: true,
    seed: seedGoal,
    call: (repo, _target, caller) => repo.markDeletedByUserId(caller),
    assertOwnerResult: (result) => expect(result).toEqual({ ok: true, value: OWNER_SEED_COUNT }),
    assertForeignResult: (result) =>
      expect(result).toEqual({ ok: true, value: STRANGER_SEED_COUNT }),
  }),
];

const EXEMPT: Exemption[] = [
  {
    method: 'create',
    kind: 'payload-scoped',
    reason:
      'Insert only. The owner arrives in each CreatePdpGoalData and is written to the ' +
      'new document; no filter is applied and no existing record is reachable, so there ' +
      'is nothing for an ownership predicate to scope.',
  },
  {
    method: 'proposalFilter',
    kind: 'private-helper',
    reason:
      'Private. Builds the shared guard for updateProposalForArtefact and ' +
      'deleteUnadoptedProposals, and leads on userId — covered through both of those ' +
      'specs, and by the mutation table, which drops its userId clause directly.',
  },
  {
    method: 'buildUserGoalsFilter',
    kind: 'private-helper',
    reason:
      'Private. Single source of truth for the owner-scoped filter behind findByUserId, ' +
      'findPaginated and countByUserId — covered through all three.',
  },
  {
    method: 'setReviewDate',
    kind: 'private-helper',
    reason:
      'Private, and not a query at all: keeps the derived sortDate key in lockstep with ' +
      'reviewDate on the write paths. Carries no filter, so it has no ownership surface.',
  },
];

describeOwnershipSuite<PdpGoalsRepository, Types.ObjectId>({
  name: 'PdpGoalsRepository',
  repoClass: PdpGoalsRepository,
  owner: OWNER,
  stranger: STRANGER,
  specs: SPECS,
  exempt: EXEMPT,
  setup: async (): Promise<OwnershipContext<PdpGoalsRepository>> => {
    const mongod = await MongoMemoryServer.create();
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: PdpGoal.name, schema: PdpGoalSchema }]),
      ],
      providers: [{ provide: PDP_GOALS_REPOSITORY, useClass: PdpGoalsRepository }],
    }).compile();

    await module.init();
    pdpGoalModel = module.get<Model<PdpGoalDocument>>(getModelToken(PdpGoal.name));

    return {
      repo: module.get(PDP_GOALS_REPOSITORY),
      connection: module.get<Connection>(getConnectionToken()),
      teardown: async () => {
        await module.close();
        await mongod.stop();
      },
    };
  },
});
