import { AnalysisRunStatus } from '@acme/shared';
import { MongooseModule, getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Connection, Model, Types } from 'mongoose';
import {
  CHECKPOINT_COLLECTION,
  CHECKPOINT_WRITES_COLLECTION,
} from '../../checkpoints/checkpoint.constants';
import { CheckpointRepository } from '../../checkpoints/checkpoint.repository';
import { CHECKPOINT_REPOSITORY } from '../../checkpoints/checkpoint.repository.interface';
import { AnalysisRunsRepository } from '../analysis-runs.repository';
import { ANALYSIS_RUNS_REPOSITORY } from '../analysis-runs.repository.interface';
import { AnalysisRunsService } from '../analysis-runs.service';
import { AnalysisRun, AnalysisRunDocument, AnalysisRunSchema } from '../schemas/analysis-run.schema';

/**
 * When a trainee deletes an entry or conversation, the cascade must take the
 * checkpoint data with it — not leave it for the sweeper's grace window.
 *
 * Everything else in that cascade scrubs clinical content synchronously
 * (`messageTombstoneUpdate` overwrites rawContent/redactedContent/content,
 * `artefactTombstoneUpdate` wipes the composed document and notes, the run
 * tombstone nulls reflectTrace/refineTrace). `checkpoints` holds a verbatim copy
 * of the same transcript and drafted entry at every superstep, so leaving it
 * behind made all of that scrubbing cosmetic for seven days.
 *
 * Integration rather than unit because the thing under test is a hard delete
 * across two collections the app does not own — MongoDBSaver writes them via the
 * raw driver, and a mock cannot show they are actually gone.
 */
describe('Delete cascade — checkpoint purge (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let service: AnalysisRunsService;
  let model: Model<AnalysisRunDocument>;
  let connection: Connection;

  const conversationId = new Types.ObjectId();
  const otherConversationId = new Types.ObjectId();

  const threadId = (convId: Types.ObjectId, runNumber: number) =>
    `${convId.toString()}:${runNumber}`;

  const userId = new Types.ObjectId();

  async function seedRun(
    convId: Types.ObjectId,
    runNumber: number,
    status: AnalysisRunStatus,
    owner: Types.ObjectId = userId
  ) {
    const thread = threadId(convId, runNumber);
    await model.create({
      xid: `run_${convId.toString()}_${runNumber}`,
      conversationId: convId,
      userId: owner,
      runNumber,
      status,
      idempotencyKey: `idem_${convId.toString()}_${runNumber}`,
      langGraphThreadId: thread,
    });

    const db = connection.db!;
    await db.collection(CHECKPOINT_COLLECTION).insertMany([
      { thread_id: thread, checkpoint_ns: '', checkpoint_id: 'ckpt-1' },
      { thread_id: thread, checkpoint_ns: '', checkpoint_id: 'ckpt-2' },
    ]);
    await db.collection(CHECKPOINT_WRITES_COLLECTION).insertOne({
      thread_id: thread,
      checkpoint_ns: '',
      checkpoint_id: 'ckpt-1',
      task_id: 't1',
      idx: 0,
    });
  }

  async function countFor(thread: string) {
    const db = connection.db!;
    const [checkpoints, writes] = await Promise.all([
      db.collection(CHECKPOINT_COLLECTION).countDocuments({ thread_id: thread }),
      db.collection(CHECKPOINT_WRITES_COLLECTION).countDocuments({ thread_id: thread }),
    ]);
    return { checkpoints, writes };
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
      providers: [
        AnalysisRunsService,
        { provide: ANALYSIS_RUNS_REPOSITORY, useClass: AnalysisRunsRepository },
        // The real repository, not a mock — a mock cannot prove the rows are gone.
        { provide: CHECKPOINT_REPOSITORY, useClass: CheckpointRepository },
      ],
    }).compile();

    await module.init();

    service = module.get(AnalysisRunsService);
    model = module.get<Model<AnalysisRunDocument>>(getModelToken(AnalysisRun.name));
    connection = module.get<Connection>(getConnectionToken());
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    const db = connection.db!;
    await Promise.all([
      model.deleteMany({}),
      db.collection(CHECKPOINT_COLLECTION).deleteMany({}),
      db.collection(CHECKPOINT_WRITES_COLLECTION).deleteMany({}),
    ]);
  });

  it('hard-deletes checkpoint data for every run on the deleted conversations', async () => {
    await seedRun(conversationId, 1, AnalysisRunStatus.COMPLETED);
    await seedRun(conversationId, 2, AnalysisRunStatus.AWAITING_INPUT);

    await service.deleteByConversationIds([conversationId], userId);

    expect(await countFor(threadId(conversationId, 1))).toEqual({ checkpoints: 0, writes: 0 });
    expect(await countFor(threadId(conversationId, 2))).toEqual({ checkpoints: 0, writes: 0 });
  });

  it('leaves another conversation’s checkpoint data untouched', async () => {
    await seedRun(conversationId, 1, AnalysisRunStatus.COMPLETED);
    await seedRun(otherConversationId, 1, AnalysisRunStatus.COMPLETED);

    await service.deleteByConversationIds([conversationId], userId);

    // The purge is thread-scoped; a filter that widened would show up here.
    expect(await countFor(threadId(otherConversationId, 1))).toEqual({
      checkpoints: 2,
      writes: 1,
    });
  });

  it('still tombstones the runs, and leaves checkpointsPurgedAt null', async () => {
    await seedRun(conversationId, 1, AnalysisRunStatus.AWAITING_INPUT);

    await service.deleteByConversationIds([conversationId], userId);

    const run = await model.findOne({ conversationId }).lean();
    expect(run!.status).toBe(AnalysisRunStatus.DELETED);
    // Deliberately null. The sweeper then revisits this run once at the grace
    // window, deletes nothing, and marks it — a standing check that this path
    // actually ran. Stamping it here would remove that.
    expect(run!.checkpointsPurgedAt).toBeNull();
    // The handle to the rows just deleted must survive the tombstone, or the
    // sweeper's re-check has nothing to look up.
    expect(run!.langGraphThreadId).toBe(threadId(conversationId, 1));
  });

  it('is a no-op for a conversation with no runs', async () => {
    await expect(service.deleteByConversationIds([otherConversationId], userId)).resolves.toBeUndefined();
  });

  /**
   * The purge is a HARD delete against collections with no `userId` to filter
   * on, so its only owner scoping is `findThreadIdsByConversationIds` upstream.
   * If that predicate is lost, a mixed-owner batch destroys the other user's
   * graph state irrecoverably — and because the run tombstone beside it IS
   * scoped, the victim is left with a live run pointing at deleted checkpoints.
   * No error, no tombstone, no route to notice.
   *
   * The batch below is unreachable in production today (the sole caller passes a
   * single owner-verified id) and that is the point: this is the guard on the
   * precondition `ArtefactsService.deleteByIds` no longer states.
   */
  it("leaves another user's checkpoints AND their run intact in a mixed-owner batch", async () => {
    const foreignUserId = new Types.ObjectId();
    await seedRun(conversationId, 1, AnalysisRunStatus.COMPLETED);
    await seedRun(otherConversationId, 1, AnalysisRunStatus.COMPLETED, foreignUserId);

    await service.deleteByConversationIds([conversationId, otherConversationId], userId);

    // Caller's own data is gone, as normal.
    expect(await countFor(threadId(conversationId, 1))).toEqual({ checkpoints: 0, writes: 0 });

    // The foreign user's checkpoints survive — this is the irrecoverable half.
    expect(await countFor(threadId(otherConversationId, 1))).toEqual({
      checkpoints: 2,
      writes: 1,
    });

    // ...and their run is untouched, so purge and tombstone stay in agreement.
    const foreignRun = await model.findOne({ conversationId: otherConversationId }).lean();
    expect(foreignRun!.status).toBe(AnalysisRunStatus.COMPLETED);
    expect(foreignRun!.langGraphThreadId).toBe(threadId(otherConversationId, 1));
  });
});
