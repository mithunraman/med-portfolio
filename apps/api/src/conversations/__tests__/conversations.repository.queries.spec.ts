import { MessageRole, MessageStatus, MessageType } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { ConversationsRepository } from '../conversations.repository';
import { ConversationStatus } from '@acme/shared';
import { Conversation, ConversationDocument, ConversationSchema } from '../schemas/conversation.schema';
import { Message, MessageDocument, MessageSchema } from '../schemas/message.schema';
import { Media, MediaSchema } from '../../media/schemas/media.schema';

/**
 * Repository query tests — verifies that deleted messages are excluded from
 * status-checking queries (hasProcessingMessages, getLastMessageRole, listMessages).
 */
describe('ConversationsRepository — deleted message filtering', () => {
  let mongod: MongoMemoryServer;
  let module: TestingModule;
  let repo: ConversationsRepository;
  let messageModel: Model<MessageDocument>;
  let conversationModel: Model<ConversationDocument>;
  const userId = new Types.ObjectId();
  const conversationId = new Types.ObjectId();

  async function insertConversation(overrides: Partial<{
    userId: Types.ObjectId;
    artefact: Types.ObjectId;
    status: ConversationStatus;
  }> = {}): Promise<ConversationDocument> {
    const [doc] = await conversationModel.create([{
      userId: overrides.userId ?? userId,
      artefact: overrides.artefact ?? new Types.ObjectId(),
      title: 'Test conversation',
      status: overrides.status ?? ConversationStatus.ACTIVE,
    }]);
    return doc;
  }

  async function insertMessage(overrides: Partial<{
    role: MessageRole;
    status: MessageStatus;
    content: string | null;
  }> = {}): Promise<MessageDocument> {
    const [doc] = await messageModel.create([{
      conversation: conversationId,
      userId,
      role: overrides.role ?? MessageRole.USER,
      messageType: MessageType.TEXT,
      rawContent: overrides.content ?? 'test',
      content: overrides.content ?? 'test',
      status: overrides.status ?? MessageStatus.COMPLETE,
      idempotencyKey: nanoidAlphanumeric(),
    }]);
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
  });

  afterEach(async () => {
    await messageModel.deleteMany({});
    await conversationModel.deleteMany({});
  });

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  describe('hasProcessingMessages', () => {
    it('returns false when only deleted messages have sub-COMPLETE status', async () => {
      // One complete message + one deleted message (status -999 < 500)
      await insertMessage({ status: MessageStatus.COMPLETE });
      await insertMessage({ status: MessageStatus.DELETED, content: '[deleted]' });

      const result = await repo.hasProcessingMessages(conversationId);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(false);
    });

    it('returns true when a non-deleted message is still processing', async () => {
      await insertMessage({ status: MessageStatus.COMPLETE });
      await insertMessage({ status: MessageStatus.PENDING });

      const result = await repo.hasProcessingMessages(conversationId);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(true);
    });
  });

  describe('getLastMessageRole', () => {
    it('skips deleted messages and returns the role of the last non-deleted message', async () => {
      // Insert in order: USER (complete), then ASSISTANT
      await insertMessage({ role: MessageRole.USER, status: MessageStatus.COMPLETE });
      const assistantMsg = await insertMessage({ role: MessageRole.ASSISTANT, status: MessageStatus.COMPLETE });

      // Soft-delete the assistant message
      await messageModel.updateOne(
        { _id: assistantMsg._id },
        { $set: { status: MessageStatus.DELETED } },
      );

      const result = await repo.getLastMessageRole(conversationId);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(MessageRole.USER);
    });
  });

  describe('listMessages', () => {
    it('excludes deleted messages from results', async () => {
      await insertMessage({ status: MessageStatus.COMPLETE, content: 'visible' });
      const deletedMsg = await insertMessage({ status: MessageStatus.COMPLETE, content: 'to delete' });

      // Soft-delete one message
      await messageModel.updateOne(
        { _id: deletedMsg._id },
        { $set: { status: MessageStatus.DELETED, content: '[deleted]' } },
      );

      const result = await repo.listMessages({ conversation: conversationId });
      expect(result.ok).toBe(true);
      expect(result.value!.messages).toHaveLength(1);
      expect(result.value!.messages[0].content).toBe('visible');
    });
  });

  describe('updateMessage — resurrection guard', () => {
    it('refuses to write to a tombstoned message and returns null', async () => {
      // Simulates a processing pipeline finishing after the message was deleted.
      const msg = await insertMessage({ status: MessageStatus.CLEANING, content: '[deleted]' });
      await messageModel.updateOne(
        { _id: msg._id },
        { $set: { status: MessageStatus.DELETED, content: '[deleted]' } },
      );

      const result = await repo.updateMessage(msg._id, {
        content: 'real redacted transcript',
        status: MessageStatus.COMPLETE,
      });

      // No-op: caller sees null, and the persisted row stays scrubbed + deleted.
      expect(result.ok).toBe(true);
      expect(result.value).toBeNull();

      const persisted = await messageModel.findById(msg._id).lean();
      expect(persisted!.status).toBe(MessageStatus.DELETED);
      expect(persisted!.content).toBe('[deleted]');
    });

    it('updates a live message and returns the new document', async () => {
      const msg = await insertMessage({ status: MessageStatus.CLEANING });

      const result = await repo.updateMessage(msg._id, {
        content: 'cleaned',
        status: MessageStatus.COMPLETE,
      });

      expect(result.ok).toBe(true);
      expect(result.value!.status).toBe(MessageStatus.COMPLETE);
      expect(result.value!.content).toBe('cleaned');
    });
  });

  // ─── Ownership scoping (IDOR regression) ───

  describe('findConversationById — userId scoping', () => {
    it('returns the conversation for its owner', async () => {
      const conv = await insertConversation();

      const result = await repo.findConversationById(conv._id, userId);

      expect(result.ok).toBe(true);
      expect(result.value?._id.toString()).toBe(conv._id.toString());
    });

    it('returns null for a different user', async () => {
      const conv = await insertConversation();
      const otherUserId = new Types.ObjectId();

      const result = await repo.findConversationById(conv._id, otherUserId);

      expect(result.ok).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('findActiveConversationByArtefact — userId scoping', () => {
    it('returns the active conversation for its owner', async () => {
      const artefact = new Types.ObjectId();
      await insertConversation({ artefact, status: ConversationStatus.ACTIVE });

      const result = await repo.findActiveConversationByArtefact(artefact, userId);

      expect(result.ok).toBe(true);
      expect(result.value).not.toBeNull();
    });

    it('does not return another user\'s conversation for the same artefact', async () => {
      const artefact = new Types.ObjectId();
      const otherUserId = new Types.ObjectId();
      await insertConversation({ artefact, userId: otherUserId, status: ConversationStatus.ACTIVE });

      const result = await repo.findActiveConversationByArtefact(artefact, userId);

      expect(result.ok).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('findActiveConversationsByArtefacts — userId scoping', () => {
    it('groups only the caller\'s conversations', async () => {
      const artefactA = new Types.ObjectId();
      const artefactB = new Types.ObjectId();
      const otherUserId = new Types.ObjectId();
      await insertConversation({ artefact: artefactA, userId });
      // Foreign conversation sharing artefactB — must be excluded.
      await insertConversation({ artefact: artefactB, userId: otherUserId });

      const result = await repo.findActiveConversationsByArtefacts([artefactA, artefactB], userId);

      expect(result.ok).toBe(true);
      expect(result.value!.get(artefactA.toString())).toBeDefined();
      expect(result.value!.get(artefactB.toString())).toBeUndefined();
    });
  });
});
