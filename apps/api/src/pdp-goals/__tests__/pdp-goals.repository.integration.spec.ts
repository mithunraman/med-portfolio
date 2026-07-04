import { PdpGoalStatus } from '@acme/shared';
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
  PdpGoalSchema,
} from '../schemas/pdp-goal.schema';

// ── Helpers ──

const userId = new Types.ObjectId();
const artefactId = new Types.ObjectId();

async function insertGoal(
  model: Model<PdpGoalDocument>,
  overrides: Partial<{
    xid: string;
    goal: string;
    userId: Types.ObjectId;
    artefactId: Types.ObjectId;
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
      artefactId: overrides.artefactId ?? artefactId,
      status: overrides.status ?? PdpGoalStatus.NOT_STARTED,
      reviewDate,
      // Maintain the same invariant the repository enforces on writes.
      sortDate: reviewDate ?? PDP_GOAL_SORT_SENTINEL,
      actions: overrides.actions ?? [
        {
          xid: 'act_default_1',
          action: 'Default action 1',
          intendedEvidence: 'Evidence 1',
          status: PdpGoalStatus.NOT_STARTED,
        },
        {
          xid: 'act_default_2',
          action: 'Default action 2',
          intendedEvidence: 'Evidence 2',
          status: PdpGoalStatus.NOT_STARTED,
        },
      ],
    },
  ]);
  return doc;
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
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.NOT_STARTED },
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

  // ─── updateGoalForArtefact (parent-scope boundary + update behaviour) ───

  describe('updateGoalForArtefact', () => {
    it('updates a goal that belongs to the given artefact', async () => {
      const reviewDate = new Date('2026-06-15');
      await insertGoal(model, {
        xid: 'goal_in_artefact',
        userId,
        artefactId,
        status: PdpGoalStatus.NOT_STARTED,
        actions: [
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.NOT_STARTED },
        ],
      });

      const result = await repo.updateGoalForArtefact(
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
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.NOT_STARTED },
          { xid: 'act_2', action: 'A2', intendedEvidence: 'E2', status: PdpGoalStatus.NOT_STARTED },
        ],
      });

      const result = await repo.updateGoalForArtefact(
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
      await insertGoal(model, {
        xid: 'goal_mixed',
        userId,
        artefactId,
        actions: [
          { xid: 'act_a', action: 'A', intendedEvidence: 'E', status: PdpGoalStatus.NOT_STARTED },
          { xid: 'act_b', action: 'B', intendedEvidence: 'E', status: PdpGoalStatus.NOT_STARTED },
          { xid: 'act_c', action: 'C', intendedEvidence: 'E', status: PdpGoalStatus.NOT_STARTED },
        ],
      });

      await repo.updateGoalForArtefact(
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
        status: PdpGoalStatus.NOT_STARTED,
        reviewDate,
        actions: [
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.NOT_STARTED },
        ],
      });

      // Finalising `artefactId` must not be able to touch `otherArtefactId`'s goal.
      const result = await repo.updateGoalForArtefact(
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
      expect(other!.status).toBe(PdpGoalStatus.NOT_STARTED);
      expect(other!.reviewDate!.toISOString()).toBe(reviewDate.toISOString());
      expect(other!.actions[0].status).toBe(PdpGoalStatus.NOT_STARTED);
    });

    it('does not mutate a goal owned by another user even with a matching artefactId and returns NOT_FOUND', async () => {
      const otherUserId = new Types.ObjectId();
      await insertGoal(model, {
        xid: 'goal_foreign_owner',
        userId: otherUserId,
        artefactId,
        status: PdpGoalStatus.STARTED,
      });

      const result = await repo.updateGoalForArtefact(
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
  });

  // ─── updateManyByArtefactId ───

  describe('updateManyByArtefactId', () => {
    it('archives all PENDING goals and their actions for an artefact', async () => {
      await insertGoal(model, { xid: 'goal_p1', status: PdpGoalStatus.NOT_STARTED });
      await insertGoal(model, { xid: 'goal_p2', status: PdpGoalStatus.NOT_STARTED });
      await insertGoal(model, { xid: 'goal_a1', status: PdpGoalStatus.STARTED });

      const result = await repo.updateManyByArtefactId(
        artefactId,
        { statuses: [PdpGoalStatus.NOT_STARTED] },
        { status: PdpGoalStatus.ARCHIVED },
      );

      expect(isOk(result)).toBe(true);

      const goals = await model.find({ artefactId }).lean();
      const pending1 = goals.find((g) => g.xid === 'goal_p1')!;
      const pending2 = goals.find((g) => g.xid === 'goal_p2')!;
      const active1 = goals.find((g) => g.xid === 'goal_a1')!;

      // PENDING goals → ARCHIVED
      expect(pending1.status).toBe(PdpGoalStatus.ARCHIVED);
      expect(pending1.actions.every((a) => a.status === PdpGoalStatus.ARCHIVED)).toBe(true);
      expect(pending2.status).toBe(PdpGoalStatus.ARCHIVED);

      // ACTIVE goal untouched
      expect(active1.status).toBe(PdpGoalStatus.STARTED);
    });

    it('archives ACTIVE and COMPLETED goals when targeted', async () => {
      await insertGoal(model, { xid: 'goal_act', status: PdpGoalStatus.STARTED });
      await insertGoal(model, { xid: 'goal_comp', status: PdpGoalStatus.COMPLETED });
      await insertGoal(model, { xid: 'goal_pend', status: PdpGoalStatus.NOT_STARTED });

      await repo.updateManyByArtefactId(
        artefactId,
        { statuses: [PdpGoalStatus.STARTED, PdpGoalStatus.COMPLETED] },
        { status: PdpGoalStatus.ARCHIVED },
      );

      const goals = await model.find({ artefactId }).lean();
      const active = goals.find((g) => g.xid === 'goal_act')!;
      const completed = goals.find((g) => g.xid === 'goal_comp')!;
      const pending = goals.find((g) => g.xid === 'goal_pend')!;

      expect(active.status).toBe(PdpGoalStatus.ARCHIVED);
      expect(active.actions.every((a) => a.status === PdpGoalStatus.ARCHIVED)).toBe(true);
      expect(completed.status).toBe(PdpGoalStatus.ARCHIVED);

      // PENDING untouched
      expect(pending.status).toBe(PdpGoalStatus.NOT_STARTED);
    });

    it('does not affect goals from a different artefact', async () => {
      const otherArtefactId = new Types.ObjectId();
      await insertGoal(model, { xid: 'goal_same', status: PdpGoalStatus.NOT_STARTED });
      await insertGoal(model, {
        xid: 'goal_other',
        artefactId: otherArtefactId,
        status: PdpGoalStatus.NOT_STARTED,
      });

      await repo.updateManyByArtefactId(
        artefactId,
        { statuses: [PdpGoalStatus.NOT_STARTED] },
        { status: PdpGoalStatus.ARCHIVED },
      );

      const otherGoal = await model.findOne({ xid: 'goal_other' }).lean();
      expect(otherGoal!.status).toBe(PdpGoalStatus.NOT_STARTED); // unchanged
    });

    it('is a no-op when no goals match the filter', async () => {
      await insertGoal(model, { xid: 'goal_active_only', status: PdpGoalStatus.STARTED });

      const result = await repo.updateManyByArtefactId(
        artefactId,
        { statuses: [PdpGoalStatus.NOT_STARTED] }, // no PENDING goals exist
        { status: PdpGoalStatus.ARCHIVED },
      );

      expect(isOk(result)).toBe(true);

      const goal = await model.findOne({ xid: 'goal_active_only' }).lean();
      expect(goal!.status).toBe(PdpGoalStatus.STARTED); // unchanged
    });

    // Guards the sortDate invariant on the bulk path — latent today (callers pass
    // only { status }), but the method handles reviewDate and must keep sortDate in sync.
    it('derives sortDate when the bulk update sets a reviewDate', async () => {
      const reviewDate = new Date('2026-08-01');
      await insertGoal(model, { xid: 'goal_bulk_rd', status: PdpGoalStatus.STARTED });

      const result = await repo.updateManyByArtefactId(
        artefactId,
        { statuses: [PdpGoalStatus.STARTED] },
        { reviewDate },
      );

      expect(isOk(result)).toBe(true);
      const updated = await model.findOne({ xid: 'goal_bulk_rd' }).lean();
      expect(updated!.reviewDate!.toISOString()).toBe(reviewDate.toISOString());
      expect(updated!.sortDate.toISOString()).toBe(reviewDate.toISOString());
    });

    it('resets sortDate to the sentinel when the bulk update clears reviewDate', async () => {
      await insertGoal(model, {
        xid: 'goal_bulk_null',
        status: PdpGoalStatus.STARTED,
        reviewDate: new Date('2026-08-01'),
      });

      const result = await repo.updateManyByArtefactId(
        artefactId,
        { statuses: [PdpGoalStatus.STARTED] },
        { reviewDate: null },
      );

      expect(isOk(result)).toBe(true);
      const updated = await model.findOne({ xid: 'goal_bulk_null' }).lean();
      expect(updated!.reviewDate).toBeNull();
      expect(updated!.sortDate.toISOString()).toBe(PDP_GOAL_SORT_SENTINEL.toISOString());
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
  });

  // ─── findPaginated (null-safe keyset pagination) ───

  describe('findPaginated', () => {
    const statuses = [
      PdpGoalStatus.NOT_STARTED,
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
        await insertGoal(model, { xid: `gnull_${i}`, status: PdpGoalStatus.NOT_STARTED });
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
        await insertGoal(model, { xid, status: PdpGoalStatus.NOT_STARTED });
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
