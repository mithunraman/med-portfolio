import {
  ConversationStatus,
  MessageRole,
  MessageStatus,
  MessageType,
} from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { Media, MediaSchema } from '../../media/schemas/media.schema';
import { ConversationsRepository } from '../conversations.repository';
import {
  Conversation,
  ConversationDocument,
  ConversationSchema,
} from '../schemas/conversation.schema';
import { Message, MessageDocument, MessageSchema } from '../schemas/message.schema';

/**
 * Ownership-predicate tests for ConversationsRepository.
 *
 * Every method here used to filter on a conversation or message id alone, and was
 * safe only because an upstream caller had already checked ownership. These tests
 * are the enforcement: each seeds a second user's record that the filter must not
 * see, so removing a `userId` clause turns one of them red.
 *
 * Survivors are asserted deep-equal against their pre-image rather than merely
 * "still exists" — a survivor that kept its row but lost a field would pass an
 * existence check.
 */
describe('ConversationsRepository — ownership predicate (integration)', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let repo: ConversationsRepository;
  let messageModel: Model<MessageDocument>;
  let conversationModel: Model<ConversationDocument>;

  const userId = new Types.ObjectId();
  const otherUserId = new Types.ObjectId();

  async function insertConversation(owner = userId) {
    const [doc] = await conversationModel.create([
      {
        userId: owner,
        artefact: new Types.ObjectId(),
        title: 'Test conversation',
        status: ConversationStatus.ACTIVE,
      },
    ]);
    return doc;
  }

  async function insertMessage(
    conversation: Types.ObjectId,
    overrides: Partial<{
      userId: Types.ObjectId;
      role: MessageRole;
      status: MessageStatus;
      content: string;
    }> = {}
  ) {
    const [doc] = await messageModel.create([
      {
        conversation,
        userId: overrides.userId ?? userId,
        role: overrides.role ?? MessageRole.USER,
        messageType: MessageType.TEXT,
        rawContent: overrides.content ?? 'clinical narrative',
        content: overrides.content ?? 'clinical narrative',
        status: overrides.status ?? MessageStatus.COMPLETE,
        idempotencyKey: nanoidAlphanumeric(),
      },
    ]);
    return doc;
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Conversation.name, schema: ConversationSchema },
          { name: Message.name, schema: MessageSchema },
          { name: Media.name, schema: MediaSchema },
        ]),
      ],
      providers: [ConversationsRepository],
    }).compile();

    repo = module.get(ConversationsRepository);
    messageModel = module.get<Model<MessageDocument>>(getModelToken(Message.name));
    conversationModel = module.get<Model<ConversationDocument>>(getModelToken(Conversation.name));
  }, 60_000);

  afterEach(async () => {
    await messageModel.deleteMany({});
    await conversationModel.deleteMany({});
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  // ─── Cascade primitives (bulk tombstones on caller-supplied id lists) ───

  describe('markDeleted', () => {
    it("leaves another user's conversation untouched even when its id is in the batch", async () => {
      const mine = await insertConversation();
      const theirs = await insertConversation(otherUserId);
      const before = await conversationModel.findById(theirs._id).lean();

      const result = await repo.markDeleted([mine._id, theirs._id], userId);

      expect(result).toEqual({ ok: true, value: 1 });
      expect((await conversationModel.findById(mine._id).lean())!.status).toBe(
        ConversationStatus.DELETED
      );
      expect(await conversationModel.findById(theirs._id).lean()).toEqual(before);
    });

    it('stays idempotent — a re-run modifies nothing and changes nothing', async () => {
      const conv = await insertConversation();
      await repo.markDeleted([conv._id], userId);
      const first = await conversationModel.findById(conv._id).lean();

      const second = await repo.markDeleted([conv._id], userId);

      expect(second).toEqual({ ok: true, value: 0 });
      expect(await conversationModel.findById(conv._id).lean()).toEqual(first);
    });
  });

  describe('markDeletedMessagesByIds', () => {
    it("does not tombstone another user's message in a mixed batch", async () => {
      const conv = await insertConversation();
      const mine = await insertMessage(conv._id);
      const theirs = await insertMessage(conv._id, { userId: otherUserId });
      const before = await messageModel.findById(theirs._id).lean();

      const result = await repo.markDeletedMessagesByIds([mine._id, theirs._id], userId);

      expect(result).toEqual({ ok: true, value: 1 });
      expect((await messageModel.findById(mine._id).lean())!.status).toBe(MessageStatus.DELETED);
      expect(await messageModel.findById(theirs._id).lean()).toEqual(before);
    });
  });

  describe('markDeletedMessagesByConversationIds', () => {
    it("does not tombstone another user's message on a shared conversation id", async () => {
      const conv = await insertConversation();
      await insertMessage(conv._id);
      const theirs = await insertMessage(conv._id, { userId: otherUserId });
      const before = await messageModel.findById(theirs._id).lean();
      const total = await messageModel.countDocuments({});

      const result = await repo.markDeletedMessagesByConversationIds([conv._id], userId);

      expect(result).toEqual({ ok: true, value: 1 });
      expect(await messageModel.findById(theirs._id).lean()).toEqual(before);
      // Catch-all: nothing outside the intended set was touched either.
      expect(await messageModel.countDocuments({})).toBe(total);
    });
  });

  // ─── Second-hop reads and writes on user-owned records ───

  describe('listMessages', () => {
    it("returns only the caller's messages for a conversation", async () => {
      const conv = await insertConversation();
      await insertMessage(conv._id, { content: 'mine' });
      await insertMessage(conv._id, { userId: otherUserId, content: 'theirs' });

      const result = await repo.listMessages({ conversation: conv._id, userId });

      expect(result.ok).toBe(true);
      const contents = result.ok ? result.value.messages.map((m) => m.content) : [];
      expect(contents).toEqual(['mine']);
    });
  });

  describe('findMessageById', () => {
    it("does not return another user's message", async () => {
      const conv = await insertConversation();
      const theirs = await insertMessage(conv._id, { userId: otherUserId });

      const result = await repo.findMessageById(theirs._id, userId);

      expect(result).toEqual({ ok: true, value: null });
    });
  });

  describe('updateMessage', () => {
    it("refuses to write another user's message and leaves it byte-identical", async () => {
      const conv = await insertConversation();
      const theirs = await insertMessage(conv._id, { userId: otherUserId });
      const before = await messageModel.findById(theirs._id).lean();

      const result = await repo.updateMessage(theirs._id, userId, {
        content: 'overwritten',
        status: MessageStatus.FAILED,
      });

      // Null is the existing "missing or deleted" contract — callers no-op on it.
      expect(result).toEqual({ ok: true, value: null });
      expect(await messageModel.findById(theirs._id).lean()).toEqual(before);
    });
  });

  describe('updateMessageIfRawContentPresent', () => {
    it("refuses to write another user's message", async () => {
      const conv = await insertConversation();
      const theirs = await insertMessage(conv._id, { userId: otherUserId });
      const before = await messageModel.findById(theirs._id).lean();

      const result = await repo.updateMessageIfRawContentPresent(theirs._id, userId, {
        redactedContent: 'overwritten',
        status: MessageStatus.CLEANING,
      });

      expect(result).toEqual({ ok: true, value: null });
      expect(await messageModel.findById(theirs._id).lean()).toEqual(before);
    });
  });

  describe('conversation-state predicates', () => {
    it("ignore another user's messages on the same conversation", async () => {
      const conv = await insertConversation();
      await insertMessage(conv._id, {
        userId: otherUserId,
        status: MessageStatus.COMPLETE,
        role: MessageRole.USER,
      });

      const complete = await repo.hasCompleteMessages(conv._id, userId);
      const lastRole = await repo.getLastMessageRole(conv._id, userId);

      // `false`/`null` are also the legitimate empty answers, so these stay
      // non-leaking as well as correct.
      expect(complete).toEqual({ ok: true, value: false });
      expect(lastRole).toEqual({ ok: true, value: null });
    });

    it("hasProcessingMessages ignores another user's in-flight message", async () => {
      const conv = await insertConversation();
      await insertMessage(conv._id, {
        userId: otherUserId,
        status: MessageStatus.PENDING,
      });

      const result = await repo.hasProcessingMessages(conv._id, userId);

      expect(result).toEqual({ ok: true, value: false });
    });

    it("hasLaterAssistantMessage ignores another user's later assistant message", async () => {
      const conv = await insertConversation();
      const mine = await insertMessage(conv._id);
      await insertMessage(conv._id, {
        userId: otherUserId,
        role: MessageRole.ASSISTANT,
      });

      const result = await repo.hasLaterAssistantMessage(conv._id, mine._id, userId);

      expect(result).toEqual({ ok: true, value: false });
    });
  });

  describe('findArtefactRefByConversationId', () => {
    it("does not resolve another user's conversation", async () => {
      const theirs = await insertConversation(otherUserId);

      const result = await repo.findArtefactRefByConversationId(theirs._id, userId);

      expect(result).toEqual({ ok: true, value: null });
    });
  });
});
