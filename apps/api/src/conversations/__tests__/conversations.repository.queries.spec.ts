import { MessageRole, MessageStatus, MessageType } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { nanoidAlphanumeric } from '../../common/utils/nanoid.util';
import { ConversationsRepository } from '../conversations.repository';
import { Conversation, ConversationDocument, ConversationSchema } from '../schemas/conversation.schema';
import { Message, MessageDocument, MessageSchema } from '../schemas/message.schema';
import { Media, MediaSchema } from '../../media/schemas/media.schema';

/**
 * Repository query tests — verifies that deleted messages are excluded from
 * status-checking queries (hasProcessingMessages, getLastMessageRole, listMessages).
 */
describe('ConversationsRepository — deleted message filtering', () => {
  let mongod: MongoMemoryServer;
  let module: any;
  let repo: ConversationsRepository;
  let messageModel: Model<MessageDocument>;
  const userId = new Types.ObjectId();
  const conversationId = new Types.ObjectId();

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
  });

  afterEach(async () => {
    await messageModel.deleteMany({});
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
});
