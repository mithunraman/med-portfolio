import { AnalysisRunStatus } from '@acme/shared';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import {
  CHECKPOINT_PURGE_GRACE_MS,
  STALE_EXECUTING_RUN_MS,
} from '../../common/checkpoint-retention.constants';
import {
  CHECKPOINT_COLLECTION,
  CHECKPOINT_WRITES_COLLECTION,
} from '../../checkpoints/checkpoint.constants';
import { CheckpointRepository } from '../../checkpoints/checkpoint.repository';
import { CHECKPOINT_REPOSITORY } from '../../checkpoints/checkpoint.repository.interface';
import { AnalysisRunsRepository } from '../analysis-runs.repository';
import { ANALYSIS_RUNS_REPOSITORY } from '../analysis-runs.repository.interface';
import { CheckpointSweeperService } from '../checkpoint-sweeper.service';
import { AnalysisRun, AnalysisRunDocument, AnalysisRunSchema } from '../schemas/analysis-run.schema';

/**
 * The checkpoint sweeper against a real database.
 *
 * `checkpoint-sweeper.service.spec.ts` covers this service's control flow with
 * mocked repositories — batching, the error break, the marker write. What a mock
 * cannot show is whether the actual selection predicate picks the right rows, and
 * that is the half that matters here: `purgeThreads` is a HARD delete against
 * collections carrying no `userId`, and the sweeper is the one caller that
 * deliberately crosses user boundaries.
 *
 * So the failure mode this guards is not a leak. If the status set or the cutoff
 * were wrong, the sweeper would hard-delete graph state for LIVE runs across
 * every account — destruction of in-flight work, with no tombstone and no
 * recovery. No ownership test can catch that, because unscoped is correct here.
 *
 * The assertions therefore come in two halves:
 *   1. it DOES cross user boundaries for genuinely collectable runs (by design),
 *   2. it does NOT touch anything still live, either user's.
 */
describe('CheckpointSweeperService (integration)', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let sweeper: CheckpointSweeperService;
  let runModel: Model<AnalysisRunDocument>;
  let connection: Connection;

  const userA = new Types.ObjectId();
  const userB = new Types.ObjectId();

  /** Wall-clock, so the `updatedAt` that expiry writes stays comparable to it. */
  const now = new Date();
  const ago = (ms: number) => new Date(now.getTime() - ms);

  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: AnalysisRun.name, schema: AnalysisRunSchema }]),
      ],
      providers: [
        CheckpointSweeperService,
        { provide: ANALYSIS_RUNS_REPOSITORY, useClass: AnalysisRunsRepository },
        { provide: CHECKPOINT_REPOSITORY, useClass: CheckpointRepository },
      ],
    }).compile();

    await module.init();
    sweeper = module.get(CheckpointSweeperService);
    runModel = module.get<Model<AnalysisRunDocument>>(getModelToken(AnalysisRun.name));
    connection = module.get<Connection>(getConnectionToken());
    // The partial unique index on { conversationId } is load-bearing for these
    // fixtures; build it rather than relying on lazy autoIndex timing.
    await runModel.syncIndexes();
  }, 120_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      runModel.deleteMany({}),
      connection.db!.collection(CHECKPOINT_COLLECTION).deleteMany({}),
      connection.db!.collection(CHECKPOINT_WRITES_COLLECTION).deleteMany({}),
    ]);
  });

  /**
   * Seeds a run plus the checkpoint rows its thread owns.
   *
   * `updatedAt` is backdated through the raw driver on purpose: Mongoose
   * timestamps would overwrite it, and both sweeper clocks are measured from it,
   * so a fixture that cannot control it cannot test either phase.
   */
  async function seedRun(opts: {
    owner: Types.ObjectId;
    status: AnalysisRunStatus;
    updatedAt: Date;
    label: string;
  }): Promise<string> {
    const conversationId = new Types.ObjectId();
    const threadId = `${conversationId.toString()}:1`;

    const [run] = await runModel.create([
      {
        conversationId,
        userId: opts.owner,
        runNumber: 1,
        status: opts.status,
        idempotencyKey: `idem_${opts.label}`,
        langGraphThreadId: threadId,
      },
    ]);

    await runModel.collection.updateOne(
      { _id: run._id },
      { $set: { updatedAt: opts.updatedAt } }
    );

    await connection.db!.collection(CHECKPOINT_COLLECTION).insertMany([
      { thread_id: threadId, checkpoint_ns: '', checkpoint_id: 'ckpt-1' },
      { thread_id: threadId, checkpoint_ns: '', checkpoint_id: 'ckpt-2' },
    ]);
    await connection.db!.collection(CHECKPOINT_WRITES_COLLECTION).insertOne({
      thread_id: threadId,
      checkpoint_ns: '',
      checkpoint_id: 'ckpt-1',
      task_id: 't1',
      idx: 0,
    });

    return threadId;
  }

  async function countCheckpoints(threadId: string) {
    const [checkpoints, writes] = await Promise.all([
      connection.db!.collection(CHECKPOINT_COLLECTION).countDocuments({ thread_id: threadId }),
      connection
        .db!.collection(CHECKPOINT_WRITES_COLLECTION)
        .countDocuments({ thread_id: threadId }),
    ]);
    return { checkpoints, writes };
  }

  const runFor = (threadId: string) => runModel.findOne({ langGraphThreadId: threadId }).lean();

  describe('purge phase', () => {
    it('purges terminal runs past the grace window for EVERY user — the sweep is deliberately cross-user', async () => {
      const collectableA = await seedRun({
        owner: userA,
        status: AnalysisRunStatus.COMPLETED,
        updatedAt: ago(CHECKPOINT_PURGE_GRACE_MS + DAY),
        label: 'a-collectable',
      });
      const collectableB = await seedRun({
        owner: userB,
        status: AnalysisRunStatus.FAILED,
        updatedAt: ago(CHECKPOINT_PURGE_GRACE_MS + DAY),
        label: 'b-collectable',
      });

      await sweeper.sweep(now);

      // Both, not one: an ownership predicate here would leave every other
      // account's checkpoint data to accumulate forever.
      expect(await countCheckpoints(collectableA)).toEqual({ checkpoints: 0, writes: 0 });
      expect(await countCheckpoints(collectableB)).toEqual({ checkpoints: 0, writes: 0 });

      // The marker is what stops a purged run being re-selected next tick.
      expect((await runFor(collectableA))!.checkpointsPurgedAt).not.toBeNull();
      expect((await runFor(collectableB))!.checkpointsPurgedAt).not.toBeNull();
    });

    it('leaves a terminal run still inside its grace window untouched', async () => {
      // The window exists so a failed run's graph state is still there when
      // someone goes looking for why it failed.
      const withinGrace = await seedRun({
        owner: userA,
        status: AnalysisRunStatus.FAILED,
        updatedAt: ago(CHECKPOINT_PURGE_GRACE_MS - DAY),
        label: 'a-within-grace',
      });

      await sweeper.sweep(now);

      expect(await countCheckpoints(withinGrace)).toEqual({ checkpoints: 2, writes: 1 });
      expect((await runFor(withinGrace))!.checkpointsPurgedAt).toBeNull();
    });

    it('never touches a live run, for either user — the mass-destruction guard', async () => {
      // The failure this exists for: a widened status set would hard-delete graph
      // state for work in progress across every account at once.
      //
      // `liveB` is the case that makes this test bite. A recently-touched run is
      // excluded by the CUTOFF whatever the status set says, so it cannot detect a
      // status defect at all. An AWAITING_INPUT run parked for a month is past the
      // 7-day purge cutoff but nowhere near the 180-day abandonment window — still
      // resumable, and excluded by status alone. That is a real trainee who walked
      // away mid-journey and intends to come back.
      const liveA = await seedRun({
        owner: userA,
        status: AnalysisRunStatus.RUNNING,
        updatedAt: ago(HOUR),
        label: 'a-live',
      });
      const liveB = await seedRun({
        owner: userB,
        status: AnalysisRunStatus.AWAITING_INPUT,
        updatedAt: ago(30 * DAY),
        label: 'b-parked',
      });

      await sweeper.sweep(now);

      expect(await countCheckpoints(liveA)).toEqual({ checkpoints: 2, writes: 1 });
      expect(await countCheckpoints(liveB)).toEqual({ checkpoints: 2, writes: 1 });
      expect((await runFor(liveA))!.status).toBe(AnalysisRunStatus.RUNNING);
      expect((await runFor(liveB))!.status).toBe(AnalysisRunStatus.AWAITING_INPUT);
    });
  });

  describe('expiry phase', () => {
    it('expires a stale executing run but does NOT purge it on the same tick', async () => {
      // Expiry bumps `updatedAt`, and the grace window is measured from there —
      // so a run expired on this tick becomes collectable a full grace window
      // later, not immediately. That is the intended semantics: it preserves the
      // debugging window CHECKPOINT_PURGE_GRACE_MS exists to provide. Suppressing
      // the bump would make every long-abandoned run purgeable the instant it
      // expired.
      const stale = await seedRun({
        owner: userA,
        status: AnalysisRunStatus.PENDING,
        updatedAt: ago(STALE_EXECUTING_RUN_MS + HOUR),
        label: 'a-stale',
      });

      const stats = await sweeper.sweep(now);

      expect(stats.expired).toBe(1);
      expect((await runFor(stale))!.status).toBe(AnalysisRunStatus.EXPIRED);
      expect(await countCheckpoints(stale)).toEqual({ checkpoints: 2, writes: 1 });
      expect((await runFor(stale))!.checkpointsPurgedAt).toBeNull();
    });

    it('leaves a recently touched executing run alone', async () => {
      const fresh = await seedRun({
        owner: userA,
        status: AnalysisRunStatus.PENDING,
        updatedAt: ago(STALE_EXECUTING_RUN_MS - HOUR),
        label: 'a-fresh',
      });

      const stats = await sweeper.sweep(now);

      expect(stats.expired).toBe(0);
      expect((await runFor(fresh))!.status).toBe(AnalysisRunStatus.PENDING);
      expect(await countCheckpoints(fresh)).toEqual({ checkpoints: 2, writes: 1 });
    });
  });

  it('is idempotent — a second sweep purges nothing further and changes nothing', async () => {
    const collectable = await seedRun({
      owner: userA,
      status: AnalysisRunStatus.COMPLETED,
      updatedAt: ago(CHECKPOINT_PURGE_GRACE_MS + DAY),
      label: 'a-idempotent',
    });

    await sweeper.sweep(now);
    const afterFirst = await runFor(collectable);

    const second = await sweeper.sweep(now);

    expect(second.threads).toBe(0);
    expect(second.checkpoints).toBe(0);
    expect(await countCheckpoints(collectable)).toEqual({ checkpoints: 0, writes: 0 });
    expect((await runFor(collectable))!.checkpointsPurgedAt).toEqual(
      afterFirst!.checkpointsPurgedAt
    );
  });
});
