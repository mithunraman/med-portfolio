import { ConversationStatus, MessageStatus, MessageRole } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import {
  CreateConversationData,
  CreateMessageData,
  DBError,
  IConversationsRepository,
  ListMessagesQuery,
  ListMessagesResult,
  UpdateMessageData,
} from './conversations.repository.interface';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';

@Injectable()
export class ConversationsRepository implements IConversationsRepository {
  private readonly logger = new Logger(ConversationsRepository.name);

  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private messageModel: Model<MessageDocument>
  ) {}

  async createConversation(
    data: CreateConversationData,
    session?: ClientSession
  ): Promise<Result<Conversation, DBError>> {
    try {
      const [conversation] = await this.conversationModel.create(
        [
          {
            userId: data.userId,
            artefact: data.artefact,
            title: data.title,
          },
        ],
        { session }
      );
      return ok(conversation);
    } catch (error) {
      this.logger.error('Failed to create conversation', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create conversation' });
    }
  }

  async findConversationById(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Conversation | null, DBError>> {
    try {
      const conversation = await this.conversationModel
        .findById(conversationId)
        .lean()
        .session(session || null);
      return ok(conversation);
    } catch (error) {
      this.logger.error('Failed to find conversation by id', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find conversation by id' });
    }
  }

  async findConversationByXid(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Conversation | null, DBError>> {
    try {
      const conversation = await this.conversationModel
        .findOne({ xid, userId })
        .lean()
        .session(session || null);
      return ok(conversation);
    } catch (error) {
      this.logger.error('Failed to find conversation', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find conversation' });
    }
  }

  async findActiveConversationByArtefact(
    artefactId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Conversation | null, DBError>> {
    try {
      const conversation = await this.conversationModel
        .findOne({ artefact: artefactId, status: ConversationStatus.ACTIVE })
        .lean()
        .session(session || null);
      return ok(conversation);
    } catch (error) {
      this.logger.error('Failed to find active conversation', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find active conversation' });
    }
  }

  async findActiveConversationsByArtefacts(
    artefactIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<Map<string, Conversation>, DBError>> {
    try {
      const conversations = await this.conversationModel
        .find({
          artefact: { $in: artefactIds },
          status: ConversationStatus.ACTIVE,
        })
        .lean()
        .session(session || null);

      const conversationMap = new Map<string, Conversation>();
      for (const conversation of conversations) {
        conversationMap.set(conversation.artefact.toString(), conversation);
      }

      return ok(conversationMap);
    } catch (error) {
      this.logger.error('Failed to find active conversations', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find active conversations' });
    }
  }

  async createMessage(
    data: CreateMessageData,
    session?: ClientSession
  ): Promise<Result<Message, DBError>> {
    try {
      const [message] = await this.messageModel.create([data], { session });

      // Update conversation's updatedAt timestamp
      await this.conversationModel.updateOne(
        { _id: data.conversation },
        { $set: { updatedAt: new Date() } },
        { session }
      );

      return ok(message);
    } catch (error) {
      this.logger.error('Failed to create message', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create message' });
    }
  }

  async findMessageById(
    messageId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Message | null, DBError>> {
    try {
      const message = await this.messageModel
        .findById(messageId)
        .populate('media')
        .lean()
        .session(session || null);
      return ok(message);
    } catch (error) {
      this.logger.error('Failed to find message', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find message' });
    }
  }

  async findMessagesByXids(
    xids: string[],
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Message[], DBError>> {
    try {
      const messages = await this.messageModel
        .find({ xid: { $in: xids }, userId })
        .populate('media')
        .populate('conversation', 'xid')
        .lean()
        .session(session || null);
      return ok(messages);
    } catch (error) {
      this.logger.error('Failed to find messages by xids', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find messages by xids' });
    }
  }

  async updateMessage(
    messageId: Types.ObjectId,
    data: UpdateMessageData,
    session?: ClientSession
  ): Promise<Result<Message | null, DBError>> {
    try {
      const message = await this.messageModel
        .findByIdAndUpdate(messageId, { $set: data }, { new: true })
        .lean()
        .session(session || null);
      return ok(message);
    } catch (error) {
      this.logger.error('Failed to update message', error);
      return err({ code: 'DB_ERROR', message: 'Failed to update message' });
    }
  }

  async listMessages(
    query: ListMessagesQuery,
    session?: ClientSession
  ): Promise<Result<ListMessagesResult, DBError>> {
    try {
      const messages = await this.messageModel
        .find({ conversation: query.conversation })
        .populate('media')
        .sort({ _id: -1 })
        .lean()
        .session(session || null);

      return ok({ messages });
    } catch (error) {
      this.logger.error('Failed to list messages', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list messages' });
    }
  }

  async hasCompleteMessages(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<boolean, DBError>> {
    try {
      const count = await this.messageModel
        .countDocuments({
          conversation: conversationId,
          role: MessageRole.USER,
          status: MessageStatus.COMPLETE,
        })
        .limit(1)
        .session(session || null);

      return ok(count > 0);
    } catch (error) {
      this.logger.error('Failed to check complete messages', error);
      return err({ code: 'DB_ERROR', message: 'Failed to check complete messages' });
    }
  }

  async hasProcessingMessages(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<boolean, DBError>> {
    try {
      const count = await this.messageModel
        .countDocuments({
          conversation: conversationId,
          role: MessageRole.USER,
          status: { $lt: MessageStatus.COMPLETE },
        })
        .limit(1)
        .session(session || null);

      return ok(count > 0);
    } catch (error) {
      this.logger.error('Failed to check processing messages', error);
      return err({ code: 'DB_ERROR', message: 'Failed to check processing messages' });
    }
  }

  async getLastMessageRole(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<MessageRole | null, DBError>> {
    try {
      const lastMessage = await this.messageModel
        .findOne({ conversation: conversationId })
        .sort({ _id: -1 })
        .select('role')
        .lean()
        .session(session || null);

      return ok(lastMessage?.role ?? null);
    } catch (error) {
      this.logger.error('Failed to get last message role', error);
      return err({ code: 'DB_ERROR', message: 'Failed to get last message role' });
    }
  }

  async findMessageByIdempotencyKey(
    userId: Types.ObjectId,
    idempotencyKey: string,
    session?: ClientSession
  ): Promise<Result<Message | null, DBError>> {
    try {
      const message = await this.messageModel
        .findOne({ userId, idempotencyKey })
        .populate('media')
        .session(session || null);

      return ok(message);
    } catch (error) {
      this.logger.error('Failed to find message by idempotency key', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find message by idempotency key' });
    }
  }

  async findArtefactXidByConversationId(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<string | null, DBError>> {
    try {
      const conversation = await this.conversationModel
        .findById(conversationId)
        .populate('artefact', 'xid')
        .lean()
        .session(session || null);

      if (!conversation) return ok(null);

      const artefact = conversation.artefact as unknown as { xid: string } | null;
      return ok(artefact?.xid ?? null);
    } catch (error) {
      this.logger.error('Failed to find artefact xid by conversation id', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find artefact xid' });
    }
  }

  async findConversationIdsByUser(
    userId: Types.ObjectId
  ): Promise<Result<Types.ObjectId[], DBError>> {
    try {
      const ids = await this.conversationModel.find({ userId }).distinct('_id');
      return ok(ids);
    } catch (error) {
      this.logger.error('Failed to find conversation ids by user', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find conversation ids' });
    }
  }

  async findMessageIdsByConversation(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Types.ObjectId[], DBError>> {
    try {
      const ids = await this.messageModel
        .find({ conversation: conversationId })
        .distinct('_id')
        .session(session || null);
      return ok(ids);
    } catch (error) {
      this.logger.error('Failed to find message ids by conversation', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find message ids by conversation' });
    }
  }

  async findConversationIdsByArtefact(
    artefactId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<Types.ObjectId[], DBError>> {
    try {
      const ids = await this.conversationModel
        .find({ artefact: artefactId })
        .distinct('_id')
        .session(session || null);
      return ok(ids);
    } catch (error) {
      this.logger.error('Failed to find conversation ids by artefact', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find conversation ids by artefact' });
    }
  }

  async anonymizeConversation(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    try {
      const convResult = await this.conversationModel.updateOne(
        { _id: conversationId },
        { $set: { title: '[deleted]', status: ConversationStatus.DELETED } },
        { session }
      );
      const msgResult = await this.messageModel.updateMany(
        { conversation: conversationId },
        {
          $set: {
            rawContent: '[deleted]',
            cleanedContent: '[deleted]',
            content: '[deleted]',
            status: MessageStatus.DELETED,
          },
          $unset: { question: '', answer: '' },
        },
        { session }
      );
      return ok(convResult.modifiedCount + msgResult.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to anonymize conversation', error);
      return err({ code: 'DB_ERROR', message: 'Failed to anonymize conversation' });
    }
  }

  async anonymizeByUser(userId: Types.ObjectId): Promise<Result<number, DBError>> {
    try {
      const convResult = await this.conversationModel.updateMany(
        { userId },
        { $set: { title: '[deleted]', status: ConversationStatus.DELETED } }
      );
      const msgResult = await this.messageModel.updateMany(
        { userId },
        {
          $set: {
            rawContent: '[deleted]',
            cleanedContent: '[deleted]',
            content: '[deleted]',
            status: MessageStatus.DELETED,
          },
          $unset: { question: '', answer: '' },
        }
      );
      return ok(convResult.modifiedCount + msgResult.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to anonymize conversations', error);
      return err({ code: 'DB_ERROR', message: 'Failed to anonymize conversations' });
    }
  }
}
