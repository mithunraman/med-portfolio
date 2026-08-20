import { ArtefactStatus, PdpGoalStatus } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { isErr, isOk } from '../../common/utils/result.util';
import { PDP_GOAL_SORT_SENTINEL } from '../pdp-goal.constants';
import { PdpGoalsRepository } from '../pdp-goals.repository';
import { PDP_GOALS_REPOSITORY } from '../pdp-goals.repository.interface';
import {
  PdpGoal,
  PdpGoalDocument,
  PdpGoalLink,
  PdpGoalSchema,
} from '../schemas/pdp-goal.schema';

// ── Helpers ──

const userId = new Types.ObjectId();
const artefactId = new Types.ObjectId();

/** A link as analysis would create it — the only kind the product makes today. */
const analysisLink = (id: Types.ObjectId): PdpGoalLink => ({
  artefactId: id,
  linkedAt: new Date(),
  linkedBy: 'analysis',
});

/**
 * A link as a trainee would create it. Unreachable in the product today, which is
 * exactly why it is worth fixturing: `proposalFilter` must already refuse to touch
 * goals carrying one, before standalone goal creation ships.
 */
const userLink = (id: Types.ObjectId): PdpGoalLink => ({
  artefactId: id,
  linkedAt: new Date(),
  linkedBy: 'user',
});

async function insertGoal(
  model: Model<PdpGoalDocument>,
  overrides: Partial<{
    xid: string;
    goal: string;
    userId: Types.ObjectId;
    /** Convenience: seeds a single analysis-created link. */
    artefactId: Types.ObjectId;
    /** Explicit link set, for multi-link and trainee-created fixtures. */
    links: PdpGoalLink[];
    status: PdpGoalStatus;
    reviewDate: Date | null;
    actions: Array<{
      xid: string;
      action: string;
      intendedEvidence: string;
      status: PdpGoalStatus;
    }>;
  }> = {},
) {
  const reviewDate = overrides.reviewDate ?? null;
  const [doc] = await model.create([
    {
      xid: overrides.xid ?? `goal_${new Types.ObjectId().toString().slice(-6)}`,
      goal: overrides.goal ?? 'Test goal',
      userId: overrides.userId ?? userId,
      links: overrides.links ?? [analysisLink(overrides.artefactId ?? artefactId)],
      status: overrides.status ?? PdpGoalStatus.PROPOSED,
      reviewDate,
      // Maintain the same invariant the repository enforces on writes.
      sortDate: reviewDate ?? PDP_GOAL_SORT_SENTINEL,
      actions: overrides.actions ?? [
        {
          xid: 'act_default_1',
          action: 'Default action 1',
          intendedEvidence: 'Evidence 1',
          status: PdpGoalStatus.PROPOSED,
        },
        {
          xid: 'act_default_2',
          action: 'Default action 2',
          intendedEvidence: 'Evidence 2',
          status: PdpGoalStatus.PROPOSED,
        },
      ],
    },
  ]);
  return doc;
}

/**
 * The lookup joins the `artefacts` collection directly, so these fixtures are
 * written raw — registering the whole Artefact schema here would pull in far more
 * than the join needs.
 */
async function insertArtefact(
  model: Model<PdpGoalDocument>,
  overrides: { _id: Types.ObjectId; xid: string; title?: string | null; status?: ArtefactStatus },
) {
  await model.db.collection('artefacts').insertOne({
    _id: overrides._id,
    xid: overrides.xid,
    title: overrides.title === undefined ? 'An entry' : overrides.title,
    status: overrides.status ?? ArtefactStatus.COMPLETED,
  });
}

// ── Test suite ──

describe('PdpGoalsRepository (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let repo: PdpGoalsRepository;
  let model: Model<PdpGoalDocument>;


  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: PdpGoal.name, schema: PdpGoalSchema }]),
      ],
      providers: [
        { provide: PDP_GOALS_REPOSITORY, useClass: PdpGoalsRepository },
      ],
    }).compile();

    await module.init();

    repo = module.get(PDP_GOALS_REPOSITORY);
    model = module.get<Model<PdpGoalDocument>>(getModelToken(PdpGoal.name));

  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  // ─── saveGoal ───

  describe('saveGoal', () => {
    it('updates goal-level fields', async () => {
      await insertGoal(model, { xid: 'goal_sg1' });

      const reviewDate = new Date('2026-09-01');
      const result = await repo.saveGoal('goal_sg1', userId, {
        status: PdpGoalStatus.STARTED,
        reviewDate,
        completionReview: 'Great progress',
      });

      expect(isOk(result)).toBe(true);

      const updated = await model.findOne({ xid: 'goal_sg1' }).lean();
      expect(updated!.status).toBe(PdpGoalStatus.STARTED);
      expect(updated!.reviewDate!.toISOString()).toBe(reviewDate.toISOString());
      expect(updated!.completionReview).toBe('Great progress');
      // Invariant: sortDate tracks reviewDate.
      expect(updated!.sortDate.toISOString()).toBe(reviewDate.toISOString());
    });

    it('resets sortDate to the sentinel when reviewDate is cleared to null', async () => {
      await insertGoal(model, { xid: 'goal_sg_null', reviewDate: new Date('2026-09-01') });

      const result = await repo.saveGoal('goal_sg_null', userId, { reviewDate: null });

      expect(isOk(result)).toBe(true);
      const updated = await model.findOne({ xid: 'goal_sg_null' }).lean();
      expect(updated!.reviewDate).toBeNull();
      expect(updated!.sortDate.toISOString()).toBe(PDP_GOAL_SORT_SENTINEL.toISOString());
    });

    it('overwrites the actions array', async () => {
      await insertGoal(model, {
        xid: 'goal_sg2',
        actions: [
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.PROPOSED },
          { xid: 'act_2', action: 'A2', intendedEvidence: 'E2', status: PdpGoalStatus.ARCHIVED },
        ],
      });

      const result = await repo.saveGoal('goal_sg2', userId, {
        actions: [
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.COMPLETED, dueDate: null, completionReview: null },
          { xid: 'act_2', action: 'A2', intendedEvidence: 'E2', status: PdpGoalStatus.ARCHIVED, dueDate: null, completionReview: null },
        ],
      });

      expect(isOk(result)).toBe(true);

      const updated = await model.findOne({ xid: 'goal_sg2' }).lean();
      expect(updated!.actions[0].status).toBe(PdpGoalStatus.COMPLETED); // act_1 updated
      expect(updated!.actions[1].status).toBe(PdpGoalStatus.ARCHIVED);  // act_2 preserved
    });

    it('does not touch unspecified fields', async () => {
      await insertGoal(model, { xid: 'goal_sg3', status: PdpGoalStatus.STARTED });

      await repo.saveGoal('goal_sg3', userId, { completionReview: 'Done' });

      const updated = await model.findOne({ xid: 'goal_sg3' }).lean();
      expect(updated!.status).toBe(PdpGoalStatus.STARTED); // unchanged
      expect(updated!.completionReview).toBe('Done');
    });

    it('refuses to write a goal owned by a different user (NOT_FOUND)', async () => {
      await insertGoal(model, { xid: 'goal_sg4', status: PdpGoalStatus.STARTED });
      const otherUser = new Types.ObjectId();

      const result = await repo.saveGoal('goal_sg4', otherUser, {
        status: PdpGoalStatus.COMPLETED,
        completionReview: 'Hijacked',
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('NOT_FOUND');

      const untouched = await model.findOne({ xid: 'goal_sg4' }).lean();
      expect(untouched!.status).toBe(PdpGoalStatus.STARTED);
      expect(untouched!.completionReview).toBeNull();
    });
  });

  // ─── updateProposalForArtefact (parent-scope boundary + update behaviour) ───

  describe('updateProposalForArtefact', () => {
    it('updates a goal that belongs to the given artefact', async () => {
      const reviewDate = new Date('2026-06-15');
      await insertGoal(model, {
        xid: 'goal_in_artefact',
        userId,
        artefactId,
        status: PdpGoalStatus.PROPOSED,
        actions: [
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.PROPOSED },
        ],
      });

      const result = await repo.updateProposalForArtefact(
        'goal_in_artefact',
        userId,
        artefactId,
        { status: PdpGoalStatus.STARTED, reviewDate },
        [{ actionXid: 'act_1', status: PdpGoalStatus.STARTED }],
      );

      expect(isOk(result)).toBe(true);

      const updated = await model.findOne({ xid: 'goal_in_artefact' }).lean();
      expect(updated!.status).toBe(PdpGoalStatus.STARTED);
      expect(updated!.reviewDate!.toISOString()).toBe(reviewDate.toISOString());
      expect(updated!.actions[0].status).toBe(PdpGoalStatus.STARTED);
      // Invariant: sortDate tracks reviewDate.
      expect(updated!.sortDate.toISOString()).toBe(reviewDate.toISOString());
    });

    it('cascades goal status to all actions when actionUpdates is undefined', async () => {
      await insertGoal(model, {
        xid: 'goal_cascade',
        userId,
        artefactId,
        actions: [
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.PROPOSED },
          { xid: 'act_2', action: 'A2', intendedEvidence: 'E2', status: PdpGoalStatus.PROPOSED },
        ],
      });

      const result = await repo.updateProposalForArtefact(
        'goal_cascade',
        userId,
        artefactId,
        { status: PdpGoalStatus.ARCHIVED },
        undefined,
      );

      expect(isOk(result)).toBe(true);

      const updated = await model.findOne({ xid: 'goal_cascade' }).lean();
      expect(updated!.status).toBe(PdpGoalStatus.ARCHIVED);
      expect(updated!.actions[0].status).toBe(PdpGoalStatus.ARCHIVED);
      expect(updated!.actions[1].status).toBe(PdpGoalStatus.ARCHIVED);
    });

    it('handles actions with mixed target statuses in one call', async () => {
      // Pins a SINGLE update: the goal fields and both action groups go out as one
      // $set with two arrayFilters identifiers. Splitting it back into per-status
      // writes would push those writes outside the proposal guard.

      await insertGoal(model, {
        xid: 'goal_mixed',
        userId,
        artefactId,
        actions: [
          { xid: 'act_a', action: 'A', intendedEvidence: 'E', status: PdpGoalStatus.PROPOSED },
          { xid: 'act_b', action: 'B', intendedEvidence: 'E', status: PdpGoalStatus.PROPOSED },
          { xid: 'act_c', action: 'C', intendedEvidence: 'E', status: PdpGoalStatus.PROPOSED },
        ],
      });

      await repo.updateProposalForArtefact(
        'goal_mixed',
        userId,
        artefactId,
        { status: PdpGoalStatus.STARTED },
        [
          { actionXid: 'act_a', status: PdpGoalStatus.STARTED },
          { actionXid: 'act_b', status: PdpGoalStatus.ARCHIVED },
          { actionXid: 'act_c', status: PdpGoalStatus.STARTED },
        ],
      );

      const updated = await model.findOne({ xid: 'goal_mixed' }).lean();
      expect(updated!.actions[0].status).toBe(PdpGoalStatus.STARTED);  // act_a
      expect(updated!.actions[1].status).toBe(PdpGoalStatus.ARCHIVED); // act_b
      expect(updated!.actions[2].status).toBe(PdpGoalStatus.STARTED);  // act_c
    });

    it('does not mutate a goal from another artefact of the same user and returns NOT_FOUND', async () => {
      const otherArtefactId = new Types.ObjectId();
      const reviewDate = new Date('2026-01-01');
      // Goal is owned by the caller, but belongs to a DIFFERENT artefact.
      await insertGoal(model, {
        xid: 'goal_other_artefact',
        userId,
        artefactId: otherArtefactId,
        status: PdpGoalStatus.PROPOSED,
        reviewDate,
        actions: [
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.PROPOSED },
        ],
      });

      // Finalising `artefactId` must not be able to touch `otherArtefactId`'s goal.
      const result = await repo.updateProposalForArtefact(
        'goal_other_artefact',
        userId,
        artefactId,
        { status: PdpGoalStatus.STARTED, reviewDate: new Date('2030-12-31') },
        [{ actionXid: 'act_1', status: PdpGoalStatus.STARTED }],
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('NOT_FOUND');

      // The other artefact's goal is untouched — status, reviewDate, and action.
      const other = await model.findOne({ xid: 'goal_other_artefact' }).lean();
      expect(other!.status).toBe(PdpGoalStatus.PROPOSED);
      expect(other!.reviewDate!.toISOString()).toBe(reviewDate.toISOString());
      expect(other!.actions[0].status).toBe(PdpGoalStatus.PROPOSED);
    });

    it('does not mutate a goal owned by another user even with a matching artefactId and returns NOT_FOUND', async () => {
      const otherUserId = new Types.ObjectId();
      await insertGoal(model, {
        xid: 'goal_foreign_owner',
        userId: otherUserId,
        artefactId,
        status: PdpGoalStatus.STARTED,
      });

      const result = await repo.updateProposalForArtefact(
        'goal_foreign_owner',
        userId,
        artefactId,
        { status: PdpGoalStatus.ARCHIVED },
        undefined,
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.code).toBe('NOT_FOUND');

      const foreign = await model.findOne({ xid: 'goal_foreign_owner' }).lean();
      expect(foreign!.status).toBe(PdpGoalStatus.STARTED);
    });
  });

  // ─── findByArtefactId (ownership scoping) ───

  describe('findByArtefactId', () => {
    it('returns only goals owned by the given user for the artefact', async () => {
      await insertGoal(model, { xid: 'goal_own', userId, artefactId });

      const result = await repo.findByArtefactId(artefactId, userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].xid).toBe('goal_own');
      }
    });

    it('does not return another user\'s goals even for a shared artefactId', async () => {
      const otherUserId = new Types.ObjectId();
      // Same artefactId, different owner — must not leak across users.
      await insertGoal(model, { xid: 'goal_foreign', userId: otherUserId, artefactId });

      const result = await repo.findByArtefactId(artefactId, userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toHaveLength(0);
    });
  });

  // ─── findByArtefactIds (ownership scoping) ───

  describe('findByArtefactIds', () => {
    it('groups goals by artefact for the given user only', async () => {
      const artefactA = new Types.ObjectId();
      const artefactB = new Types.ObjectId();
      const otherUserId = new Types.ObjectId();

      await insertGoal(model, { xid: 'goal_a', userId, artefactId: artefactA });
      await insertGoal(model, { xid: 'goal_b', userId, artefactId: artefactB });
      // Foreign goal sharing artefactA — must be excluded.
      await insertGoal(model, { xid: 'goal_foreign', userId: otherUserId, artefactId: artefactA });

      const result = await repo.findByArtefactIds([artefactA, artefactB], userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.get(artefactA.toString())).toHaveLength(1);
        expect(result.value.get(artefactA.toString())![0].xid).toBe('goal_a');
        expect(result.value.get(artefactB.toString())).toHaveLength(1);
      }
    });

    it('keys a goal under every requested artefact it cites', async () => {
      const artefactA = new Types.ObjectId();
      const artefactB = new Types.ObjectId();
      await insertGoal(model, {
        xid: 'goal_shared',
        userId,
        links: [analysisLink(artefactA), analysisLink(artefactB)],
      });

      const result = await repo.findByArtefactIds([artefactA, artefactB], userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      // One goal, reachable from both entries — the single-owner grouping this
      // replaced would have dropped it from whichever key it did not match first.
      expect(result.value.get(artefactA.toString())![0].xid).toBe('goal_shared');
      expect(result.value.get(artefactB.toString())![0].xid).toBe('goal_shared');
    });
  });

  // ─── findOneWithArtefacts (the citation lookup) ───

  describe('findOneWithArtefacts', () => {
    beforeEach(async () => {
      await model.db.collection('artefacts').deleteMany({});
    });

    it('surfaces a null title rather than coercing it', async () => {
      // Artefact titles are nullable: the Mongoose prop defaults to null, and
      // analysis writes `title: finalState.title` from a graph field that also
      // defaults to null — in the very transaction that creates the linked goals.
      // The DTO must carry that through honestly; the client owns the fallback.
      const artefactOid = new Types.ObjectId();
      await insertArtefact(model, { _id: artefactOid, xid: 'art_untitled', title: null });
      await insertGoal(model, { xid: 'goal_untitled', userId, artefactId: artefactOid });

      const result = await repo.findOneWithArtefacts('goal_untitled', userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result) || !result.value) return;
      expect(result.value.linkedArtefacts).toHaveLength(1);
      expect(result.value.linkedArtefacts[0].title).toBeNull();
      expect(result.value.linkedArtefacts[0].xid).toBe('art_untitled');
    });

    it('excludes a tombstoned entry but keeps an archived one', async () => {
      // Links are append-only, so this filter is the ONLY thing keeping a deleted
      // entry out of a goal's citation list. An archived entry is still evidence.
      const deletedOid = new Types.ObjectId();
      const archivedOid = new Types.ObjectId();
      await insertArtefact(model, {
        _id: deletedOid,
        xid: 'art_deleted',
        status: ArtefactStatus.DELETED,
      });
      await insertArtefact(model, {
        _id: archivedOid,
        xid: 'art_archived',
        status: ArtefactStatus.ARCHIVED,
      });
      await insertGoal(model, {
        xid: 'goal_mixed_links',
        userId,
        links: [analysisLink(deletedOid), analysisLink(archivedOid)],
      });

      const result = await repo.findOneWithArtefacts('goal_mixed_links', userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result) || !result.value) return;
      expect(result.value.linkedArtefacts.map((a) => a.xid)).toEqual(['art_archived']);
    });

    it('returns every cited entry, in link order', async () => {
      const firstOid = new Types.ObjectId();
      const secondOid = new Types.ObjectId();
      await insertArtefact(model, { _id: firstOid, xid: 'art_first', title: 'First' });
      await insertArtefact(model, { _id: secondOid, xid: 'art_second', title: 'Second' });
      await insertGoal(model, {
        xid: 'goal_two_links',
        userId,
        links: [analysisLink(firstOid), analysisLink(secondOid)],
      });

      const result = await repo.findOneWithArtefacts('goal_two_links', userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result) || !result.value) return;
      // Order comes from `links`, not from the unordered $lookup result.
      expect(result.value.linkedArtefacts.map((a) => a.xid)).toEqual(['art_first', 'art_second']);
    });

    it('returns an empty citation list when every linked entry is gone', async () => {
      const goneOid = new Types.ObjectId();
      await insertGoal(model, { xid: 'goal_orphaned', userId, artefactId: goneOid });

      const result = await repo.findOneWithArtefacts('goal_orphaned', userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result) || !result.value) return;
      // The goal survives its entries — an empty list, never a missing goal.
      expect(result.value.linkedArtefacts).toEqual([]);
    });

    it('does not return a goal owned by another user', async () => {
      const artefactOid = new Types.ObjectId();
      await insertArtefact(model, { _id: artefactOid, xid: 'art_theirs' });
      await insertGoal(model, {
        xid: 'goal_theirs',
        userId: new Types.ObjectId(),
        artefactId: artefactOid,
      });

      const result = await repo.findOneWithArtefacts('goal_theirs', userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBeNull();
    });
  });

  // ─── deleteUnadoptedProposals (proposalFilter — the destructive predicate) ───

  describe('deleteUnadoptedProposals', () => {
    it('deletes unclaimed proposals produced by the given artefacts', async () => {
      await insertGoal(model, { xid: 'prop_1', artefactId, status: PdpGoalStatus.PROPOSED });
      await insertGoal(model, { xid: 'prop_2', artefactId, status: PdpGoalStatus.PROPOSED });

      const result = await repo.deleteUnadoptedProposals([artefactId], userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(2);
      expect(await model.countDocuments({ xid: { $in: ['prop_1', 'prop_2'] } })).toBe(0);
    });

    it('leaves a goal the trainee adopted', async () => {
      await insertGoal(model, { xid: 'adopted', artefactId, status: PdpGoalStatus.STARTED });

      await repo.deleteUnadoptedProposals([artefactId], userId);

      expect(await model.countDocuments({ xid: 'adopted' })).toBe(1);
    });

    it('leaves proposals belonging to a different artefact', async () => {
      const otherArtefactId = new Types.ObjectId();
      await insertGoal(model, { xid: 'other_prop', artefactId: otherArtefactId });

      await repo.deleteUnadoptedProposals([artefactId], userId);

      expect(await model.countDocuments({ xid: 'other_prop' })).toBe(1);
    });

    it('is a no-op for an empty id list', async () => {
      await insertGoal(model, { xid: 'untouched', artefactId });

      const result = await repo.deleteUnadoptedProposals([], userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(0);
      expect(await model.countDocuments({ xid: 'untouched' })).toBe(1);
    });

    // ── Guards for states the product cannot yet produce ──
    //
    // proposalFilter's `linkedBy` and `$size` clauses are inert today: every goal
    // carries exactly one analysis-created link. The two fixtures below build the
    // states that standalone goal creation and second-entry linking will produce,
    // and pin the predicate against them NOW. The failure they prevent is a silent
    // delete of the trainee's own goals inside a transaction that reports success.

    it('leaves a PROPOSED goal whose link the trainee created (standalone-goal guard)', async () => {
      await insertGoal(model, {
        xid: 'trainee_made',
        status: PdpGoalStatus.PROPOSED,
        links: [userLink(artefactId)],
      });

      const result = await repo.deleteUnadoptedProposals([artefactId], userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(0);
      expect(await model.countDocuments({ xid: 'trainee_made' })).toBe(1);
    });

    it('does not delete another user\'s proposal for the same artefact id', async () => {
      const otherUserId = new Types.ObjectId();
      // Same artefactId, different owner. Artefact _id is internal so this is not
      // reachable through a controller today — the predicate is defence in depth,
      // and it is also what lets the delete use { userId, 'links.artefactId' }
      // instead of scanning the whole collection.
      await insertGoal(model, { xid: 'mine', userId, artefactId });
      await insertGoal(model, { xid: 'theirs', userId: otherUserId, artefactId });

      const result = await repo.deleteUnadoptedProposals([artefactId], userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(1);
      expect(await model.countDocuments({ xid: 'mine' })).toBe(0);
      expect(await model.countDocuments({ xid: 'theirs' })).toBe(1);
    });

    it('leaves a PROPOSED goal cited by a second entry (multi-link guard)', async () => {
      const secondArtefactId = new Types.ObjectId();
      await insertGoal(model, {
        xid: 'two_citations',
        status: PdpGoalStatus.PROPOSED,
        links: [analysisLink(artefactId), analysisLink(secondArtefactId)],
      });

      // Either entry replaying its analysis must leave the shared goal intact.
      expect(isOk(await repo.deleteUnadoptedProposals([artefactId], userId))).toBe(true);
      expect(isOk(await repo.deleteUnadoptedProposals([secondArtefactId], userId))).toBe(true);

      expect(await model.countDocuments({ xid: 'two_citations' })).toBe(1);
    });
  });

  // ─── anonymizeGoal (owns the "is this deletable" decision) ───
  //
  // `PdpGoalsService.deleteGoal` no longer pre-reads the goal: it calls this and
  // trusts the boolean. That moved the status and ownership rules here, so this is
  // where they are covered.

  describe('anonymizeGoal', () => {
    it.each([
      ['PROPOSED', PdpGoalStatus.PROPOSED],
      ['STARTED', PdpGoalStatus.STARTED],
      ['COMPLETED', PdpGoalStatus.COMPLETED],
      ['ARCHIVED', PdpGoalStatus.ARCHIVED],
    ])('tombstones a %s goal and reports that it matched', async (_label, status) => {
      await insertGoal(model, { xid: 'goal_del', userId, status, goal: 'Real goal text' });

      const result = await repo.anonymizeGoal('goal_del', userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(true);

      const doc = await model.findOne({ xid: 'goal_del' }).lean();
      expect(doc!.status).toBe(PdpGoalStatus.DELETED);
      expect(doc!.goal).toBe('[deleted]');
      expect(doc!.actions.every((a) => a.action === '[deleted]')).toBe(true);
      expect(doc!.actions.every((a) => a.intendedEvidence === '[deleted]')).toBe(true);
    });

    it('reports false for an already-deleted goal and leaves it alone', async () => {
      await insertGoal(model, {
        xid: 'goal_gone',
        userId,
        status: PdpGoalStatus.DELETED,
        goal: '[deleted]',
      });

      const result = await repo.anonymizeGoal('goal_gone', userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(false);
    });

    it('reports false for a goal that does not exist', async () => {
      const result = await repo.anonymizeGoal('goal_nope', userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(false);
    });

    it("does not touch another user's goal", async () => {
      // Ownership predicate at the persistence layer. With the service's pre-read
      // gone, this filter is the only thing standing between a client-supplied xid
      // and someone else's goal.
      const otherUserId = new Types.ObjectId();
      await insertGoal(model, {
        xid: 'goal_theirs',
        userId: otherUserId,
        status: PdpGoalStatus.STARTED,
        goal: 'Their goal text',
      });

      const result = await repo.anonymizeGoal('goal_theirs', userId);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(false);

      const doc = await model.findOne({ xid: 'goal_theirs' }).lean();
      expect(doc!.status).toBe(PdpGoalStatus.STARTED);
      expect(doc!.goal).toBe('Their goal text');
    });
  });

  // ─── buildUserGoalsFilter (count and list must describe the same set) ───

  describe('buildUserGoalsFilter', () => {
    it('gives countByUserId and findByUserId the same answer for a due-window query', async () => {
      const dueBefore = new Date('2026-03-01');
      await insertGoal(model, {
        xid: 'due_soon',
        status: PdpGoalStatus.STARTED,
        reviewDate: new Date('2026-02-10'),
      });
      await insertGoal(model, {
        xid: 'due_later',
        status: PdpGoalStatus.STARTED,
        reviewDate: new Date('2026-09-01'),
      });
      // Never due: a proposal carries reviewDate null, so sortDate is the sentinel.
      await insertGoal(model, { xid: 'a_proposal', status: PdpGoalStatus.PROPOSED });

      const statuses = [PdpGoalStatus.PROPOSED, PdpGoalStatus.STARTED];
      const list = await repo.findByUserId(userId, statuses, { dueBefore, sortByReviewDate: true });
      const count = await repo.countByUserId(userId, statuses, { dueBefore });

      expect(isOk(list)).toBe(true);
      expect(isOk(count)).toBe(true);
      if (!isOk(list) || !isOk(count)) return;

      expect(list.value.map((g) => g.xid)).toEqual(['due_soon']);
      // The regression: countByUserId ignored dueBefore entirely and answered 3,
      // which is how the dashboard came to show a total its own list contradicted.
      expect(count.value).toBe(list.value.length);
    });
  });

  // ─── create (sortDate invariant) ───

  describe('create', () => {
    it('defaults new goals to null reviewDate and the sentinel sortDate', async () => {
      const result = await repo.create([
        { userId, artefactId, goal: 'Fresh goal', actions: [] },
      ]);

      expect(isOk(result)).toBe(true);
      const created = await model.findOne({ goal: 'Fresh goal' }).lean();
      expect(created!.reviewDate).toBeNull();
      expect(created!.sortDate.toISOString()).toBe(PDP_GOAL_SORT_SENTINEL.toISOString());
    });

    it('seeds exactly one analysis-created link to the originating artefact', async () => {
      await repo.create([{ userId, artefactId, goal: 'Linked goal', actions: [] }]);

      const created = await model.findOne({ goal: 'Linked goal' }).lean();
      expect(created!.links).toHaveLength(1);
      expect(created!.links[0].artefactId.toString()).toBe(artefactId.toString());
      expect(created!.links[0].linkedBy).toBe('analysis');
    });
  });

  // ─── findPaginated (null-safe keyset pagination) ───

  describe('findPaginated', () => {
    const statuses = [
      PdpGoalStatus.PROPOSED,
      PdpGoalStatus.STARTED,
      PdpGoalStatus.COMPLETED,
    ];

    // Walk every page, returning the flattened list of goal xids in order.
    async function paginateAll(limit: number): Promise<string[]> {
      const seen: string[] = [];
      let cursor: string | undefined;
      // Guard against an infinite loop if pagination ever fails to advance.
      for (let guard = 0; guard < 100; guard++) {
        const result = await repo.findPaginated(userId, statuses, cursor, limit);
        expect(isOk(result)).toBe(true);
        if (!isOk(result)) break;
        seen.push(...result.value.items.map((g) => g.xid));
        if (!result.value.nextCursor) break;
        cursor = result.value.nextCursor;
      }
      return seen;
    }

    it('returns a usable nextCursor when the boundary goal has a null reviewDate (regression)', async () => {
      // 21 goals, all with null reviewDate → boundary goal (#20) is null.
      // Pre-fix this threw while building the cursor → 500.
      for (let i = 0; i < 21; i++) {
        await insertGoal(model, { xid: `gnull_${i}`, status: PdpGoalStatus.PROPOSED });
      }

      const page1 = await repo.findPaginated(userId, statuses, undefined, 20);

      expect(isOk(page1)).toBe(true);
      if (!isOk(page1)) return;
      expect(page1.value.items).toHaveLength(20);
      expect(page1.value.nextCursor).not.toBeNull();
      // reviewDate is still surfaced honestly as null — the sentinel never leaks.
      expect(page1.value.items[0].reviewDate).toBeNull();

      const page2 = await repo.findPaginated(userId, statuses, page1.value.nextCursor!, 20);
      expect(isOk(page2)).toBe(true);
      if (!isOk(page2)) return;
      expect(page2.value.items).toHaveLength(1);
      expect(page2.value.nextCursor).toBeNull();
    });

    it('paginates an all-null-reviewDate set fully, without duplicates or gaps', async () => {
      const xids = Array.from({ length: 25 }, (_, i) => `gall_${i}`);
      for (const xid of xids) {
        await insertGoal(model, { xid, status: PdpGoalStatus.PROPOSED });
      }

      const seen = await paginateAll(10);

      expect(seen).toHaveLength(25);
      expect(new Set(seen).size).toBe(25); // no duplicates
      expect(new Set(seen)).toEqual(new Set(xids)); // no gaps
    });

    it('orders scheduled goals (real reviewDate) before unscheduled (null) goals', async () => {
      await insertGoal(model, { xid: 'g_unscheduled', status: PdpGoalStatus.STARTED, reviewDate: null });
      await insertGoal(model, {
        xid: 'g_early',
        status: PdpGoalStatus.STARTED,
        reviewDate: new Date('2026-01-01'),
      });
      await insertGoal(model, {
        xid: 'g_late',
        status: PdpGoalStatus.STARTED,
        reviewDate: new Date('2026-12-01'),
      });

      const seen = await paginateAll(20);

      expect(seen).toEqual(['g_early', 'g_late', 'g_unscheduled']);
    });

    it('scopes results to the requesting user', async () => {
      const otherUserId = new Types.ObjectId();
      await insertGoal(model, { xid: 'mine', userId, status: PdpGoalStatus.STARTED });
      await insertGoal(model, { xid: 'theirs', userId: otherUserId, status: PdpGoalStatus.STARTED });

      const result = await repo.findPaginated(userId, statuses, undefined, 20);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.items.map((g) => g.xid)).toEqual(['mine']);
    });

    it('returns INVALID_CURSOR (not DB_ERROR) for a malformed cursor', async () => {
      // A hand-edited / truncated cursor must be reported as client input error
      // (→ 400), not swallowed by the catch and mis-reported as DB_ERROR (→ 500).
      const result = await repo.findPaginated(userId, statuses, 'not-a-valid-cursor', 20);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe('INVALID_CURSOR');
    });
  });
});
