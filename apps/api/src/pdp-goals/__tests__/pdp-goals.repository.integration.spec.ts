import { PdpGoalStatus } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { isOk } from '../../common/utils/result.util';
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
  const [doc] = await model.create([
    {
      xid: overrides.xid ?? `goal_${new Types.ObjectId().toString().slice(-6)}`,
      goal: overrides.goal ?? 'Test goal',
      userId: overrides.userId ?? userId,
      artefactId: overrides.artefactId ?? artefactId,
      status: overrides.status ?? PdpGoalStatus.NOT_STARTED,
      reviewDate: overrides.reviewDate ?? null,
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

  // ─── updateGoal ───

  describe('updateGoal', () => {
    it('updates goal-level fields and specific action statuses via actionUpdates', async () => {
      await insertGoal(model, {
        xid: 'goal_ug1',
        actions: [
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.NOT_STARTED },
          { xid: 'act_2', action: 'A2', intendedEvidence: 'E2', status: PdpGoalStatus.NOT_STARTED },
        ],
      });

      const reviewDate = new Date('2026-06-15');
      const result = await repo.updateGoal(
        'goal_ug1',
        { status: PdpGoalStatus.STARTED, reviewDate },
        [
          { actionXid: 'act_1', status: PdpGoalStatus.STARTED },
          { actionXid: 'act_2', status: PdpGoalStatus.ARCHIVED },
        ],
      );

      expect(isOk(result)).toBe(true);

      const updated = await model.findOne({ xid: 'goal_ug1' }).lean();
      expect(updated!.status).toBe(PdpGoalStatus.STARTED);
      expect(updated!.reviewDate!.toISOString()).toBe(reviewDate.toISOString());
      expect(updated!.actions[0].status).toBe(PdpGoalStatus.STARTED);
      expect(updated!.actions[1].status).toBe(PdpGoalStatus.ARCHIVED);
    });

    it('cascades goal status to all actions when actionUpdates is undefined', async () => {
      await insertGoal(model, {
        xid: 'goal_cascade',
        actions: [
          { xid: 'act_1', action: 'A1', intendedEvidence: 'E1', status: PdpGoalStatus.NOT_STARTED },
          { xid: 'act_2', action: 'A2', intendedEvidence: 'E2', status: PdpGoalStatus.NOT_STARTED },
        ],
      });

      const result = await repo.updateGoal(
        'goal_cascade',
        { status: PdpGoalStatus.ARCHIVED },
        undefined, // cascade
      );

      expect(isOk(result)).toBe(true);

      const updated = await model.findOne({ xid: 'goal_cascade' }).lean();
      expect(updated!.status).toBe(PdpGoalStatus.ARCHIVED);
      expect(updated!.actions[0].status).toBe(PdpGoalStatus.ARCHIVED);
      expect(updated!.actions[1].status).toBe(PdpGoalStatus.ARCHIVED);
    });

    it('updates only reviewDate without changing statuses', async () => {
      await insertGoal(model, { xid: 'goal_rd' });

      const reviewDate = new Date('2026-09-01');
      const result = await repo.updateGoal(
        'goal_rd',
        { reviewDate },
        [], // empty array = no action updates, no cascade
      );

      expect(isOk(result)).toBe(true);

      const updated = await model.findOne({ xid: 'goal_rd' }).lean();
      expect(updated!.status).toBe(PdpGoalStatus.NOT_STARTED); // unchanged
      expect(updated!.reviewDate!.toISOString()).toBe(reviewDate.toISOString());
      expect(updated!.actions[0].status).toBe(PdpGoalStatus.NOT_STARTED); // unchanged
    });

    it('handles actions with mixed target statuses in one call', async () => {
      await insertGoal(model, {
        xid: 'goal_mixed',
        actions: [
          { xid: 'act_a', action: 'A', intendedEvidence: 'E', status: PdpGoalStatus.NOT_STARTED },
          { xid: 'act_b', action: 'B', intendedEvidence: 'E', status: PdpGoalStatus.NOT_STARTED },
          { xid: 'act_c', action: 'C', intendedEvidence: 'E', status: PdpGoalStatus.NOT_STARTED },
        ],
      });

      await repo.updateGoal(
        'goal_mixed',
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
  });
});
