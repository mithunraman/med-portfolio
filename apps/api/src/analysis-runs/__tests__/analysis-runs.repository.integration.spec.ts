import {
  AnalysisRunStatus,
  NON_TERMINAL_RUN_STATUSES,
  TERMINAL_RUN_STATUSES,
} from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { isOk } from '../../common/utils/result.util';
import { AnalysisRunsRepository } from '../analysis-runs.repository';
import {
  ANALYSIS_RUNS_REPOSITORY,
  IAnalysisRunsRepository,
} from '../analysis-runs.repository.interface';
import { AnalysisRun, AnalysisRunDocument, AnalysisRunSchema } from '../schemas/analysis-run.schema';

/**
 * The active-run slot: `findActiveRun` (the application guard) and the partial
 * unique index (the database constraint) must agree on which statuses occupy a
 * conversation's single slot. They disagreed once — a local
 * `TERMINAL_STATUSES = [COMPLETED, FAILED]` in the repository was not updated
 * when EXPIRED was added, so a run the sweeper had just declared dead still read
 * as active and 409'd every attempt to start a new one.
 *
 * These are integration tests on purpose: the unique index is the half that a
 * unit test cannot observe.
 */
describe('AnalysisRunsRepository — active-run slot (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let repo: IAnalysisRunsRepository;
  let model: Model<AnalysisRunDocument>;

  const userId = new Types.ObjectId();
  const conversationId = new Types.ObjectId();

  async function insertRun(status: AnalysisRunStatus, runNumber = 1) {
    await model.create({
      xid: `run_${runNumber}_${status}`,
      conversationId,
      userId,
      runNumber,
      status,
      idempotencyKey: `idem_${runNumber}_${status}`,
      langGraphThreadId: `${conversationId.toString()}:${runNumber}`,
    });
  }

  /**
   * `updatedAt` is managed by `timestamps: true`, so backdate it with timestamps
   * disabled for that write — otherwise the sweep cutoff can never be crossed.
   */
  async function backdate(runNumber: number, status: AnalysisRunStatus, updatedAt: Date) {
    await model.updateOne(
      { xid: `run_${runNumber}_${status}` },
      { $set: { updatedAt } },
      { timestamps: false }
    );
  }

  function createNextRun(runNumber: number) {
    return repo.createRun({
      conversationId,
      userId,
      runNumber,
      idempotencyKey: `idem_new_${runNumber}`,
      langGraphThreadId: `${conversationId.toString()}:${runNumber}`,
    });
  }

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: AnalysisRun.name, schema: AnalysisRunSchema }]),
      ],
      providers: [{ provide: ANALYSIS_RUNS_REPOSITORY, useClass: AnalysisRunsRepository }],
    }).compile();

    await module.init();

    repo = module.get(ANALYSIS_RUNS_REPOSITORY);
    model = module.get<Model<AnalysisRunDocument>>(getModelToken(AnalysisRun.name));

    // The partial unique index is the subject of half this suite, so build it
    // explicitly rather than relying on autoIndex having finished.
    await model.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  // ─── The regression ───

  describe('after the sweeper expires a wedged run', () => {
    it('no longer reports an active run', async () => {
      await insertRun(AnalysisRunStatus.EXPIRED);

      const result = await repo.findActiveRun(conversationId, userId);

      expect(isOk(result)).toBe(true);
      expect(isOk(result) && result.value).toBeNull();
    });

    it('lets the trainee start a new analysis on that conversation', async () => {
      // The guarantee STALE_EXECUTING_RUN_MS exists to provide: expiring a run
      // stuck in RUNNING must actually release the conversation's slot, at the
      // database level and not merely in the phase the client is shown.
      await insertRun(AnalysisRunStatus.EXPIRED, 1);

      const created = await createNextRun(2);

      expect(isOk(created)).toBe(true);
    });

    it('stops routing graph progress to the dead run', async () => {
      await insertRun(AnalysisRunStatus.EXPIRED);

      const result = await repo.updateCurrentStep(conversationId, userId, 'reflect');

      expect(isOk(result) && result.value).toBeNull();
      const run = await model.findOne({ conversationId }).lean();
      expect(run!.currentStep).toBeNull();
    });
  });

  // ─── The incidental fix, made deliberate ───

  it('does not report a tombstoned run as active', async () => {
    // Pre-existing latent bug: DELETED (-999) was absent from the old local
    // list too. Unreachable in practice today because a deleted conversation is
    // CLOSED upstream, but the repository should not depend on a caller-side
    // guard to be correct.
    await insertRun(AnalysisRunStatus.DELETED);

    const result = await repo.findActiveRun(conversationId, userId);

    expect(isOk(result) && result.value).toBeNull();
  });

  // ─── The sweep query, which the sweeper's own spec mocks away ───

  describe('findRunsForSweepBatch', () => {
    const OLD = new Date('2020-01-01');
    const CUTOFF = new Date('2021-01-01');

    it('returns runs across every requested status in a single query', async () => {
      // One `$in` query rather than one per status. Batches may therefore mix
      // statuses, which is what the caller is written to expect.
      await insertRun(AnalysisRunStatus.COMPLETED, 1);
      await insertRun(AnalysisRunStatus.EXPIRED, 2);
      await backdate(1, AnalysisRunStatus.COMPLETED, OLD);
      await backdate(2, AnalysisRunStatus.EXPIRED, OLD);

      const result = await repo.findRunsForSweepBatch([...TERMINAL_RUN_STATUSES], CUTOFF, 25);

      expect(isOk(result)).toBe(true);
      const rows = isOk(result) ? result.value : [];
      expect(rows).toHaveLength(2);
      // Both fields the two callers act on must be projected: `status` is the
      // optimistic lock's expected value, `langGraphThreadId` the purge handle.
      expect(rows.map((r) => r.langGraphThreadId).sort()).toEqual([
        `${conversationId.toString()}:1`,
        `${conversationId.toString()}:2`,
      ]);
      expect(rows.every((r) => typeof r.status === 'number')).toBe(true);
    });

    it('excludes runs already purged, and runs newer than the cutoff', async () => {
      await insertRun(AnalysisRunStatus.COMPLETED, 1);
      await insertRun(AnalysisRunStatus.FAILED, 2);
      await backdate(1, AnalysisRunStatus.COMPLETED, OLD);
      await backdate(2, AnalysisRunStatus.FAILED, OLD);
      // Run 1 has been swept already; run 3 is terminal but still recent.
      await model.updateOne(
        { xid: `run_1_${AnalysisRunStatus.COMPLETED}` },
        { $set: { checkpointsPurgedAt: new Date() } },
        { timestamps: false }
      );
      await insertRun(AnalysisRunStatus.EXPIRED, 3);

      const result = await repo.findRunsForSweepBatch([...TERMINAL_RUN_STATUSES], CUTOFF, 25);

      const rows = isOk(result) ? result.value : [];
      expect(rows.map((r) => r.langGraphThreadId)).toEqual([`${conversationId.toString()}:2`]);
    });

    it('honours the batch limit', async () => {
      for (let i = 1; i <= 5; i++) {
        await insertRun(AnalysisRunStatus.COMPLETED, i);
        await backdate(i, AnalysisRunStatus.COMPLETED, OLD);
      }

      const result = await repo.findRunsForSweepBatch([...TERMINAL_RUN_STATUSES], CUTOFF, 2);

      expect(isOk(result) && result.value).toHaveLength(2);
    });
  });

  // ─── The bulk expiry, whose predicate IS the optimistic lock ───

  describe('expireStaleRuns', () => {
    const OLD = new Date('2020-01-01');
    const CUTOFF = new Date('2021-01-01');
    const NON_TERMINAL = [
      AnalysisRunStatus.PENDING,
      AnalysisRunStatus.RUNNING,
      AnalysisRunStatus.AWAITING_INPUT,
    ];

    it('transitions matching runs to EXPIRED and reports the count', async () => {
      await insertRun(AnalysisRunStatus.AWAITING_INPUT, 1);
      await backdate(1, AnalysisRunStatus.AWAITING_INPUT, OLD);

      const result = await repo.expireStaleRuns(NON_TERMINAL, CUTOFF);

      expect(isOk(result) && result.value).toBe(1);
      const run = await model.findOne({ runNumber: 1 }).lean();
      expect(run!.status).toBe(AnalysisRunStatus.EXPIRED);
    });

    it('clears currentStep and currentQuestion', async () => {
      // currentQuestion going null is what makes the client stop offering the
      // stale question as answerable.
      await insertRun(AnalysisRunStatus.AWAITING_INPUT, 1);
      await model.updateOne(
        { runNumber: 1 },
        {
          $set: {
            currentStep: 'ask_followup',
            currentQuestion: {
              messageId: new Types.ObjectId(),
              node: 'ask_followup',
              questionType: 'free_text',
            },
          },
        },
        { timestamps: false }
      );
      await backdate(1, AnalysisRunStatus.AWAITING_INPUT, OLD);

      await repo.expireStaleRuns(NON_TERMINAL, CUTOFF);

      const run = await model.findOne({ runNumber: 1 }).lean();
      expect(run!.currentStep).toBeNull();
      expect(run!.currentQuestion).toBeNull();
    });

    it('bumps updatedAt, so the purge grace runs from expiry not last activity', async () => {
      // Load-bearing and supplied by Mongoose timestamps rather than by this
      // code. Without the bump, a run abandoned 180 days ago would satisfy the
      // 7-day purge cutoff the instant it was expired — the grace period would
      // silently not exist. A `{ timestamps: false }` here would do exactly that.
      await insertRun(AnalysisRunStatus.AWAITING_INPUT, 1);
      await backdate(1, AnalysisRunStatus.AWAITING_INPUT, OLD);

      await repo.expireStaleRuns(NON_TERMINAL, CUTOFF);

      const run = await model.findOne({ runNumber: 1 }).lean();
      expect(run!.updatedAt.getTime()).toBeGreaterThan(OLD.getTime());
      // And therefore not yet collectable by the purge phase.
      const purgeable = await repo.findRunsForSweepBatch(
        [...TERMINAL_RUN_STATUSES],
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        25
      );
      expect(isOk(purgeable) && purgeable.value).toHaveLength(0);
    });

    it('leaves a run that moved on — the filter is the lock', async () => {
      // The guarantee the per-run findOneAndUpdate(_id, status) used to give.
      // A run that resumed (status no longer in the set) must survive untouched
      // even though its updatedAt is still old.
      await insertRun(AnalysisRunStatus.COMPLETED, 1);
      await backdate(1, AnalysisRunStatus.COMPLETED, OLD);

      const result = await repo.expireStaleRuns(NON_TERMINAL, CUTOFF);

      expect(isOk(result) && result.value).toBe(0);
      const run = await model.findOne({ runNumber: 1 }).lean();
      expect(run!.status).toBe(AnalysisRunStatus.COMPLETED);
    });

    it('leaves a run touched more recently than the cutoff', async () => {
      await insertRun(AnalysisRunStatus.RUNNING, 1); // updatedAt = now

      const result = await repo.expireStaleRuns(NON_TERMINAL, CUTOFF);

      expect(isOk(result) && result.value).toBe(0);
      const run = await model.findOne({ runNumber: 1 }).lean();
      expect(run!.status).toBe(AnalysisRunStatus.RUNNING);
    });

    it('releases the conversation slot, so a new run can start', async () => {
      // The whole point of the short clock: a wedged PENDING/RUNNING run blocks
      // every future analysis via the partial unique index.
      await insertRun(AnalysisRunStatus.RUNNING, 1);
      await backdate(1, AnalysisRunStatus.RUNNING, OLD);

      await repo.expireStaleRuns(NON_TERMINAL, CUTOFF);

      expect(isOk(await createNextRun(2))).toBe(true);
    });
  });

  // ─── The invariant, pinned as behaviour rather than as a comment ───

  describe('guard and unique index agree on which statuses hold the slot', () => {
    it.each([...NON_TERMINAL_RUN_STATUSES])(
      'status %i occupies the slot: findActiveRun matches AND a second run is rejected',
      async (status) => {
        await insertRun(status, 1);

        const active = await repo.findActiveRun(conversationId, userId);
        expect(isOk(active) && active.value).not.toBeNull();

        const created = await createNextRun(2);
        expect(isOk(created)).toBe(false);
        expect(!isOk(created) && created.error.code).toBe('DUPLICATE_ACTIVE_RUN');
      }
    );

    it.each([...TERMINAL_RUN_STATUSES])(
      'status %i releases the slot: findActiveRun is null AND a second run is allowed',
      async (status) => {
        await insertRun(status, 1);

        const active = await repo.findActiveRun(conversationId, userId);
        expect(isOk(active) && active.value).toBeNull();

        const created = await createNextRun(2);
        expect(isOk(created)).toBe(true);
      }
    );
  });

  // ─── Ownership scoping ───

  describe('ownership predicate', () => {
    const otherUserId = new Types.ObjectId();

    /** A run on the SAME conversation id, owned by someone else. */
    async function insertForeignRun(status = AnalysisRunStatus.RUNNING) {
      const [doc] = await model.create([
        {
          xid: 'run_foreign',
          conversationId,
          userId: otherUserId,
          runNumber: 99,
          status,
          idempotencyKey: 'idem_foreign',
          langGraphThreadId: `${conversationId.toString()}:99`,
        },
      ]);
      return doc;
    }

    it('findRunById does not return another user\'s run', async () => {
      const foreign = await insertForeignRun();

      const result = await repo.findRunById(foreign._id, userId);

      expect(result).toEqual({ ok: true, value: null });
    });

    it('findActiveRun ignores another user\'s active run on the same conversation', async () => {
      await insertForeignRun(AnalysisRunStatus.RUNNING);

      const result = await repo.findActiveRun(conversationId, userId);

      expect(isOk(result) && result.value).toBeNull();
    });

    it('updateRunStatus refuses to transition another user\'s run', async () => {
      const foreign = await insertForeignRun(AnalysisRunStatus.RUNNING);
      const before = await model.findById(foreign._id).lean();

      const result = await repo.updateRunStatus(foreign._id, userId, AnalysisRunStatus.RUNNING, {
        status: AnalysisRunStatus.COMPLETED,
      });

      // Null result — the optimistic-lock path the service already treats as failure.
      expect(isOk(result) && result.value).toBeNull();
      expect(await model.findById(foreign._id).lean()).toEqual(before);
    });

    it('markDeletedByConversationIds leaves another user\'s run on the same conversation', async () => {
      await insertRun(AnalysisRunStatus.COMPLETED, 1);
      const foreign = await insertForeignRun(AnalysisRunStatus.COMPLETED);
      const before = await model.findById(foreign._id).lean();

      const result = await repo.markDeletedByConversationIds([conversationId], userId);

      expect(result).toEqual({ ok: true, value: 1 });
      expect(await model.findById(foreign._id).lean()).toEqual(before);
    });
  });
});
