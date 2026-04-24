import {
  AnalysisRunStatus,
  ArtefactStatus,
  ConversationStatus,
  ItemStatus,
  MediaStatus,
  MessageStatus,
  MessageRole,
  MessageType,
  OutboxStatus,
  PdpGoalStatus,
  ReviewPeriodStatus,
  Specialty,
  UserRole,
} from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { AnalysisRun, AnalysisRunSchema } from '../../analysis-runs/schemas/analysis-run.schema';
import { AnalysisRunsRepository } from '../../analysis-runs/analysis-runs.repository';
import { ANALYSIS_RUNS_REPOSITORY } from '../../analysis-runs/analysis-runs.repository.interface';
import { Artefact, ArtefactSchema } from '../../artefacts/schemas/artefact.schema';
import { ArtefactsRepository } from '../../artefacts/artefacts.repository';
import { ARTEFACTS_REPOSITORY } from '../../artefacts/artefacts.repository.interface';
import { User, UserSchema } from '../../auth/schemas/user.schema';
import { Conversation, ConversationSchema } from '../../conversations/schemas/conversation.schema';
import { Message, MessageSchema } from '../../conversations/schemas/message.schema';
import { ConversationsRepository } from '../../conversations/conversations.repository';
import { CONVERSATIONS_REPOSITORY } from '../../conversations/conversations.repository.interface';
import { Item, ItemSchema } from '../../items/schemas/item.schema';
import { ItemsRepository } from '../../items/items.repository';
import { ITEMS_REPOSITORY } from '../../items/items.repository.interface';
import { Media, MediaSchema } from '../../media/schemas/media.schema';
import { MediaRepository } from '../../media/media.repository';
import { MEDIA_REPOSITORY } from '../../media/media.repository.interface';
import { OutboxEntry, OutboxEntrySchema } from '../../outbox/schemas/outbox.schema';
import { OutboxRepository } from '../../outbox/outbox.repository';
import { OUTBOX_REPOSITORY } from '../../outbox/outbox.repository.interface';
import { PdpGoal, PdpGoalSchema } from '../../pdp-goals/schemas/pdp-goal.schema';
import { PdpGoalsRepository } from '../../pdp-goals/pdp-goals.repository';
import { PDP_GOALS_REPOSITORY } from '../../pdp-goals/pdp-goals.repository.interface';
import { ReviewPeriod, ReviewPeriodSchema } from '../../review-periods/schemas/review-period.schema';
import { ReviewPeriodsRepository } from '../../review-periods/review-periods.repository';
import { REVIEW_PERIODS_REPOSITORY } from '../../review-periods/review-periods.repository.interface';
import {
  VersionHistory,
  VersionHistorySchema,
} from '../../version-history/schemas/version-history.schema';
import { VersionHistoryRepository } from '../../version-history/version-history.repository';
import { VERSION_HISTORY_REPOSITORY } from '../../version-history/version-history.repository.interface';
import { TransactionService } from '../../database/transaction.service';
import { StorageService } from '../../storage/storage.service';
import { AccountCleanupService } from '../account-cleanup.service';

// ── Helpers ──

const oid = () => new Types.ObjectId();
const userAId = oid();
const userBId = oid();

const mockStorageService = {
  deleteObject: jest.fn().mockResolvedValue(undefined),
};

// ── Test suite ──

describe('AccountCleanupService (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let service: AccountCleanupService;
  let userModel: Model<User>;
  let artefactModel: Model<Artefact>;
  let conversationModel: Model<Conversation>;
  let messageModel: Model<Message>;
  let mediaModel: Model<Media>;
  let pdpGoalModel: Model<PdpGoal>;
  let reviewPeriodModel: Model<ReviewPeriod>;
  let analysisRunModel: Model<AnalysisRun>;
  let itemModel: Model<Item>;
  let versionHistoryModel: Model<VersionHistory>;
  let outboxModel: Model<OutboxEntry>;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: Artefact.name, schema: ArtefactSchema },
          { name: Conversation.name, schema: ConversationSchema },
          { name: Message.name, schema: MessageSchema },
          { name: Media.name, schema: MediaSchema },
          { name: PdpGoal.name, schema: PdpGoalSchema },
          { name: ReviewPeriod.name, schema: ReviewPeriodSchema },
          { name: AnalysisRun.name, schema: AnalysisRunSchema },
          { name: Item.name, schema: ItemSchema },
          { name: VersionHistory.name, schema: VersionHistorySchema },
          { name: OutboxEntry.name, schema: OutboxEntrySchema },
        ]),
      ],
      providers: [
        AccountCleanupService,
        TransactionService,
        { provide: ARTEFACTS_REPOSITORY, useClass: ArtefactsRepository },
        { provide: CONVERSATIONS_REPOSITORY, useClass: ConversationsRepository },
        { provide: MEDIA_REPOSITORY, useClass: MediaRepository },
        { provide: PDP_GOALS_REPOSITORY, useClass: PdpGoalsRepository },
        { provide: REVIEW_PERIODS_REPOSITORY, useClass: ReviewPeriodsRepository },
        { provide: ANALYSIS_RUNS_REPOSITORY, useClass: AnalysisRunsRepository },
        { provide: ITEMS_REPOSITORY, useClass: ItemsRepository },
        { provide: VERSION_HISTORY_REPOSITORY, useClass: VersionHistoryRepository },
        { provide: OUTBOX_REPOSITORY, useClass: OutboxRepository },
        { provide: StorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get(AccountCleanupService);
    userModel = module.get(getModelToken(User.name));
    artefactModel = module.get(getModelToken(Artefact.name));
    conversationModel = module.get(getModelToken(Conversation.name));
    messageModel = module.get(getModelToken(Message.name));
    mediaModel = module.get(getModelToken(Media.name));
    pdpGoalModel = module.get(getModelToken(PdpGoal.name));
    reviewPeriodModel = module.get(getModelToken(ReviewPeriod.name));
    analysisRunModel = module.get(getModelToken(AnalysisRun.name));
    itemModel = module.get(getModelToken(Item.name));
    versionHistoryModel = module.get(getModelToken(VersionHistory.name));
    outboxModel = module.get(getModelToken(OutboxEntry.name));
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clean all collections
    await Promise.all([
      userModel.deleteMany({}),
      artefactModel.deleteMany({}),
      conversationModel.deleteMany({}),
      messageModel.deleteMany({}),
      mediaModel.deleteMany({}),
      pdpGoalModel.deleteMany({}),
      reviewPeriodModel.deleteMany({}),
      analysisRunModel.deleteMany({}),
      itemModel.deleteMany({}),
      versionHistoryModel.deleteMany({}),
      outboxModel.deleteMany({}),
    ]);
  });

  // ── Seed helpers ──

  async function seedUser(userId: Types.ObjectId, opts: { deletion?: boolean } = {}) {
    await userModel.create({
      _id: userId,
      name: `User ${userId.toString().slice(-4)}`,
      email: `user-${userId.toString().slice(-4)}@example.com`,
      role: UserRole.USER,
      specialty: Specialty.GP,
      trainingStage: 'ST1',
      deletionRequestedAt: opts.deletion ? new Date(Date.now() - 72 * 60 * 60 * 1000) : null,
      deletionScheduledFor: opts.deletion ? new Date(Date.now() - 24 * 60 * 60 * 1000) : null,
      anonymizedAt: null,
    });
  }

  async function seedFullData(userId: Types.ObjectId) {
    const convId = oid();
    const artefactOid = oid();

    await artefactModel.create({
      xid: `art_${userId.toString().slice(-6)}`,
      artefactId: `artefact-${userId}`,
      userId,
      specialty: Specialty.GP,
      trainingStage: 'ST1',
      title: `Artefact for ${userId}`,
      status: ArtefactStatus.COMPLETED,
    });

    await conversationModel.create({
      _id: convId,
      xid: `conv_${userId.toString().slice(-6)}`,
      userId,
      artefact: artefactOid,
      title: `Conversation for ${userId}`,
      status: ConversationStatus.ACTIVE,
    });

    await messageModel.create({
      xid: `msg_${userId.toString().slice(-6)}`,
      conversation: convId,
      userId,
      role: MessageRole.USER,
      messageType: MessageType.TEXT,
      rawContent: `Raw content for ${userId}`,
      cleanedContent: `Cleaned content for ${userId}`,
      content: `Content for ${userId}`,
      status: MessageStatus.COMPLETE,
      idempotencyKey: `idem_${userId}`,
    });

    await mediaModel.create({
      xid: `med_${userId.toString().slice(-6)}`,
      userId,
      bucket: 'test-bucket',
      key: `media/${userId}/audio.m4a`,
      mediaType: 100,
      mimeType: 'audio/m4a',
      status: MediaStatus.ATTACHED,
    });

    await pdpGoalModel.create({
      xid: `goal_${userId.toString().slice(-6)}`,
      userId,
      artefactId: artefactOid,
      goal: `Goal for ${userId}`,
      status: PdpGoalStatus.NOT_STARTED,
      actions: [
        {
          xid: `act_${userId.toString().slice(-6)}`,
          action: `Action for ${userId}`,
          intendedEvidence: `Evidence for ${userId}`,
          status: PdpGoalStatus.NOT_STARTED,
        },
      ],
    });

    await reviewPeriodModel.create({
      xid: `rp_${userId.toString().slice(-6)}`,
      userId,
      name: `Review period for ${userId}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      status: ReviewPeriodStatus.ACTIVE,
    });

    await itemModel.create({
      userId,
      name: `Item for ${userId}`,
      description: `Description for ${userId}`,
      status: ItemStatus.ACTIVE,
    });

    await versionHistoryModel.create({
      xid: `vh_${userId.toString().slice(-6)}`,
      entityType: 'artefact',
      entityId: artefactOid,
      userId,
      version: 1,
      timestamp: new Date(),
      snapshot: { title: 'Original title', content: 'Original content' },
    });

    await analysisRunModel.create({
      xid: `run_${userId.toString().slice(-6)}`,
      conversationId: convId,
      runNumber: 1,
      status: AnalysisRunStatus.COMPLETED,
      idempotencyKey: `idem_run_${userId}`,
      langGraphThreadId: `thread_${userId}`,
    });

    await outboxModel.create({
      type: 'analysis.start',
      payload: { userId: userId.toString(), conversationId: convId.toString() },
      status: OutboxStatus.PENDING,
    });

    return { convId, artefactOid };
  }

  // ── Tests ──

  it('should anonymize user A data and leave user B data untouched', async () => {
    // Seed both users — only user A has deletion scheduled
    await seedUser(userAId, { deletion: true });
    await seedUser(userBId);
    await seedFullData(userAId);
    await seedFullData(userBId);

    // Act
    await service.processExpiredDeletions();

    // ── Assert User A is anonymized ──

    const userA = await userModel.findById(userAId).lean();
    expect(userA!.name).toBe('Deleted User');
    expect(userA!.email).toBe(`deleted-${userAId.toString()}@removed.local`);
    expect(userA!.specialty).toBeNull();
    expect(userA!.trainingStage).toBeNull();
    expect(userA!.deletionRequestedAt).toBeNull();
    expect(userA!.deletionScheduledFor).toBeNull();
    expect(userA!.anonymizedAt).toBeInstanceOf(Date);

    const artefactA = await artefactModel.findOne({ userId: userAId }).lean();
    expect(artefactA!.title).toBe('[deleted]');
    expect(artefactA!.reflection).toEqual([]);
    expect(artefactA!.capabilities).toEqual([]);
    expect(artefactA!.status).toBe(ArtefactStatus.DELETED);

    const convA = await conversationModel.findOne({ userId: userAId }).lean();
    expect(convA!.title).toBe('[deleted]');
    expect(convA!.status).toBe(ConversationStatus.DELETED);

    const msgA = await messageModel.findOne({ userId: userAId }).lean();
    expect(msgA!.rawContent).toBe('[deleted]');
    expect(msgA!.cleanedContent).toBe('[deleted]');
    expect(msgA!.content).toBe('[deleted]');
    expect(msgA!.status).toBe(MessageStatus.DELETED);
    expect(msgA!.question).toBeUndefined();
    expect(msgA!.answer).toBeUndefined();

    const mediaA = await mediaModel.findOne({ userId: userAId }).lean();
    expect(mediaA!.status).toBe(MediaStatus.DELETED);
    expect(mockStorageService.deleteObject).toHaveBeenCalledWith(
      'test-bucket',
      `media/${userAId}/audio.m4a`
    );

    const goalA = await pdpGoalModel.findOne({ userId: userAId }).lean();
    expect(goalA!.goal).toBe('[deleted]');
    expect(goalA!.status).toBe(PdpGoalStatus.DELETED);
    expect(goalA!.actions[0].action).toBe('[deleted]');
    expect(goalA!.actions[0].intendedEvidence).toBe('[deleted]');
    expect(goalA!.actions[0].status).toBe(PdpGoalStatus.DELETED);

    const rpA = await reviewPeriodModel.findOne({ userId: userAId }).lean();
    expect(rpA!.name).toBe('[deleted]');
    expect(rpA!.status).toBe(ReviewPeriodStatus.DELETED);

    const itemA = await itemModel.findOne({ userId: userAId }).lean();
    expect(itemA!.name).toBe('[deleted]');
    expect(itemA!.description).toBe('[deleted]');
    expect(itemA!.status).toBe(ItemStatus.DELETED);

    const vhA = await versionHistoryModel.findOne({ userId: userAId }).lean();
    expect(vhA).toBeNull(); // hard deleted

    const runA = await analysisRunModel.findOne({
      conversationId: convA!._id,
    }).lean();
    expect(runA!.status).toBe(AnalysisRunStatus.DELETED);
    expect(runA!.langGraphThreadId).toBe('[deleted]');

    const outboxA = await outboxModel.findOne({
      'payload.userId': userAId.toString(),
    }).lean();
    expect(outboxA!.status).toBe(OutboxStatus.FAILED);
    expect(outboxA!.lastError).toBe('Account deleted');

    // ── Assert User B is completely untouched ──

    const userB = await userModel.findById(userBId).lean();
    expect(userB!.name).toBe(`User ${userBId.toString().slice(-4)}`);
    expect(userB!.email).toBe(`user-${userBId.toString().slice(-4)}@example.com`);
    expect(userB!.specialty).toBe(Specialty.GP);
    expect(userB!.anonymizedAt).toBeNull();

    const artefactB = await artefactModel.findOne({ userId: userBId }).lean();
    expect(artefactB!.title).toBe(`Artefact for ${userBId}`);
    expect(artefactB!.status).toBe(ArtefactStatus.COMPLETED);

    const convB = await conversationModel.findOne({ userId: userBId }).lean();
    expect(convB!.title).toBe(`Conversation for ${userBId}`);
    expect(convB!.status).toBe(ConversationStatus.ACTIVE);

    const msgB = await messageModel.findOne({ userId: userBId }).lean();
    expect(msgB!.content).toBe(`Content for ${userBId}`);
    expect(msgB!.status).toBe(MessageStatus.COMPLETE);

    const mediaB = await mediaModel.findOne({ userId: userBId }).lean();
    expect(mediaB!.status).toBe(MediaStatus.ATTACHED);

    const goalB = await pdpGoalModel.findOne({ userId: userBId }).lean();
    expect(goalB!.goal).toBe(`Goal for ${userBId}`);
    expect(goalB!.status).toBe(PdpGoalStatus.NOT_STARTED);
    expect(goalB!.actions[0].action).toBe(`Action for ${userBId}`);

    const rpB = await reviewPeriodModel.findOne({ userId: userBId }).lean();
    expect(rpB!.name).toBe(`Review period for ${userBId}`);
    expect(rpB!.status).toBe(ReviewPeriodStatus.ACTIVE);

    const itemB = await itemModel.findOne({ userId: userBId }).lean();
    expect(itemB!.name).toBe(`Item for ${userBId}`);
    expect(itemB!.status).toBe(ItemStatus.ACTIVE);

    const vhB = await versionHistoryModel.findOne({ userId: userBId }).lean();
    expect(vhB).not.toBeNull();
    expect(vhB!.snapshot).toEqual({ title: 'Original title', content: 'Original content' });

    const runB = await analysisRunModel.findOne({
      conversationId: convB!._id,
    }).lean();
    expect(runB!.status).toBe(AnalysisRunStatus.COMPLETED);
    expect(runB!.langGraphThreadId).toBe(`thread_${userBId}`);

    const outboxB = await outboxModel.findOne({
      'payload.userId': userBId.toString(),
    }).lean();
    expect(outboxB!.status).toBe(OutboxStatus.PENDING);
  });

  it('should be idempotent — second run is a no-op', async () => {
    await seedUser(userAId, { deletion: true });
    await seedFullData(userAId);

    // First run
    await service.processExpiredDeletions();

    const userAfterFirst = await userModel.findById(userAId).lean();
    expect(userAfterFirst!.anonymizedAt).toBeInstanceOf(Date);
    const firstAnonymizedAt = userAfterFirst!.anonymizedAt!.getTime();

    // Reset mock to track second run calls
    mockStorageService.deleteObject.mockClear();

    // Second run — should skip (anonymizedAt is set, deletionScheduledFor is cleared)
    await service.processExpiredDeletions();

    // S3 delete should NOT be called again
    expect(mockStorageService.deleteObject).not.toHaveBeenCalled();

    // anonymizedAt should be unchanged
    const userAfterSecond = await userModel.findById(userAId).lean();
    expect(userAfterSecond!.anonymizedAt!.getTime()).toBe(firstAnonymizedAt);
  });
});
