import { OutboxStatus } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { TransactionService } from '../../database/transaction.service';
import { OutboxRepository } from '../outbox.repository';
import { OutboxEntry, OutboxEntryDocument, OutboxEntrySchema } from '../schemas/outbox.schema';

/**
 * `cancelByConversationIds` is the delete cascade's stop-queued-work step: when a
 * trainee deletes an entry, any job still waiting to run against it must be
 * cancelled rather than executed against tombstoned records.
 *
 * Its failure direction is the opposite of the destructive writes around it. A
 * tombstone that matches too few rows leaves data behind; a *cancellation* that
 * matches too few rows lets queued work run. So the tests that matter most here
 * are the ones proving it does not under-match — see `payload shape` below.
 *
 * Integration rather than unit because the thing under test is a Mongo filter
 * over a `Mixed` payload column. A mocked model can only confirm which object
 * literal was passed, which is the bug's hiding place, not its detection.
 */
describe('OutboxRepository.cancelByConversationIds (integration)', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let repo: OutboxRepository;
  let model: Model<OutboxEntryDocument>;

  const convA = new Types.ObjectId().toString();
  const convB = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  async function insertJob(
    overrides: Partial<{
      type: string;
      payload: Record<string, unknown>;
      status: OutboxStatus;
    }> = {}
  ) {
    const [doc] = await model.create([
      {
        type: overrides.type ?? 'analysis.resume',
        payload: overrides.payload ?? { conversationId: convA, userId, analysisRunId: 'run_1' },
        status: overrides.status ?? OutboxStatus.PENDING,
      },
    ]);
    return doc;
  }

  const reload = (id: Types.ObjectId) => model.findById(id).lean();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: OutboxEntry.name, schema: OutboxEntrySchema }]),
      ],
      providers: [
        OutboxRepository,
        // Injected by the repository but unused on this path.
        { provide: TransactionService, useValue: {} },
      ],
    }).compile();

    await module.init();
    repo = module.get(OutboxRepository);
    model = module.get<Model<OutboxEntryDocument>>(getModelToken(OutboxEntry.name));
  }, 60_000);

  afterEach(async () => {
    await model.deleteMany({});
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  describe('the jobs it must cancel', () => {
    it.each([OutboxStatus.PENDING, OutboxStatus.PROCESSING])(
      'cancels a %i job for a deleted conversation',
      async (status) => {
        const job = await insertJob({ status });

        const result = await repo.cancelByConversationIds([convA]);

        expect(result).toEqual({ ok: true, value: 1 });
        const after = await reload(job._id);
        expect(after!.status).toBe(OutboxStatus.FAILED);
        expect(after!.lastError).toBe('Entity deleted');
      }
    );

    it('cancels every matching job across a multi-conversation batch', async () => {
      await insertJob({ payload: { conversationId: convA, userId } });
      await insertJob({ payload: { conversationId: convB, userId } });

      const result = await repo.cancelByConversationIds([convA, convB]);

      expect(result).toEqual({ ok: true, value: 2 });
    });
  });

  describe('the jobs it must leave alone', () => {
    it('leaves a job for a different conversation untouched', async () => {
      const other = await insertJob({ payload: { conversationId: convB, userId } });
      const before = await reload(other._id);

      const result = await repo.cancelByConversationIds([convA]);

      expect(result).toEqual({ ok: true, value: 0 });
      expect(await reload(other._id)).toEqual(before);
    });

    it.each([OutboxStatus.COMPLETED, OutboxStatus.FAILED])(
      'leaves an already-settled (%i) job untouched',
      async (status) => {
        const settled = await insertJob({ status });
        const before = await reload(settled._id);

        await repo.cancelByConversationIds([convA]);

        // Notably it must not overwrite an existing `lastError` with 'Entity deleted'.
        expect(await reload(settled._id)).toEqual(before);
      }
    );

    it('is a no-op for an empty id list', async () => {
      const job = await insertJob();
      const before = await reload(job._id);

      const result = await repo.cancelByConversationIds([]);

      expect(result).toEqual({ ok: true, value: 0 });
      expect(await reload(job._id)).toEqual(before);
    });
  });

  /**
   * The regression this file was written for.
   *
   * A `payload.userId` clause was briefly added here as an ownership predicate.
   * It was redundant — the ids arrive from owner-scoped resolvers and a
   * conversation has one owner — and it introduced a silent escape: any
   * conversation-bearing job whose payload happened to omit `userId` stopped
   * matching, survived the cascade, and ran against tombstoned records.
   *
   * `payload` is a `Mixed` column with no schema, so that class of job costs
   * nothing to create and produces no compile error. These tests are what stop
   * the clause coming back.
   */
  describe('payload shape', () => {
    it('cancels a conversation-bearing job that carries no userId', async () => {
      const job = await insertJob({
        payload: { conversationId: convA, analysisRunId: 'run_1' },
      });

      const result = await repo.cancelByConversationIds([convA]);

      expect(result).toEqual({ ok: true, value: 1 });
      expect((await reload(job._id))!.status).toBe(OutboxStatus.FAILED);
    });

    it("cancels regardless of which user the payload names", async () => {
      // Unreachable in production (a conversation has one owner), and cancelled
      // anyway — the conversation id is the authority on this path, not the payload.
      const job = await insertJob({
        payload: { conversationId: convA, userId: new Types.ObjectId().toString() },
      });

      const result = await repo.cancelByConversationIds([convA]);

      expect(result).toEqual({ ok: true, value: 1 });
      expect((await reload(job._id))!.status).toBe(OutboxStatus.FAILED);
    });

    it('leaves a job with no conversationId at all untouched', async () => {
      // `message.process` carries { messageId, userId } and is deliberately out of
      // scope for this method — its pipeline halts on MESSAGE_LIVE_FILTER instead.
      const job = await insertJob({
        type: 'message.process',
        payload: { messageId: new Types.ObjectId().toString(), userId },
      });
      const before = await reload(job._id);

      const result = await repo.cancelByConversationIds([convA]);

      expect(result).toEqual({ ok: true, value: 0 });
      expect(await reload(job._id)).toEqual(before);
    });
  });
});
