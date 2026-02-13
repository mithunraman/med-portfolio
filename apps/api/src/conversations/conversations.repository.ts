import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import {
  CreateMessageData,
  DBError,
  IConversationsRepository,
  ListConversationsQuery,
  ListConversationsResult,
  ListMessagesQuery,
  ListMessagesResult,
  UpsertConversationData,
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

  async upsertConversation(
    data: UpsertConversationData,
    session?: ClientSession
  ): Promise<Result<ConversationDocument, DBError>> {
    try {
      const conversation = await this.conversationModel.findOneAndUpdate(
        { conversationId: data.conversationId },
        {
          $setOnInsert: {
            conversationId: data.conversationId,
            userId: data.userId,
            title: data.title,
          },
        },
        { upsert: true, new: true, session }
      );
      return ok(conversation);
    } catch (error) {
      this.logger.error('Failed to upsert conversation', error);
      return err({ code: 'DB_ERROR', message: 'Failed to upsert conversation' });
    }
  }

  async findConversationById(
    conversationId: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<ConversationDocument | null, DBError>> {
    try {
      const conversation = await this.conversationModel
        .findOne({ conversationId, userId })
        .session(session || null);
      return ok(conversation);
    } catch (error) {
      this.logger.error('Failed to find conversation', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find conversation' });
    }
  }

  async listConversations(
    query: ListConversationsQuery,
    session?: ClientSession
  ): Promise<Result<ListConversationsResult, DBError>> {
    try {
      const filter: { userId: Types.ObjectId; _id?: { $lt: Types.ObjectId } } = {
        userId: query.userId,
      };

      if (query.cursor) {
        filter._id = { $lt: query.cursor };
      }

      const conversations = await this.conversationModel
        .find(filter)
        .sort({ _id: -1 })
        .limit(query.limit)
        .session(session || null);

      return ok({ conversations });
    } catch (error) {
      this.logger.error('Failed to list conversations', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list conversations' });
    }
  }

  async createMessage(
    data: CreateMessageData,
    session?: ClientSession
  ): Promise<Result<MessageDocument, DBError>> {
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

  async listMessages(
    query: ListMessagesQuery,
    session?: ClientSession
  ): Promise<Result<ListMessagesResult, DBError>> {
    try {
      const filter: { conversation: Types.ObjectId; _id?: { $lt: Types.ObjectId } } = {
        conversation: query.conversation,
      };

      if (query.cursor) {
        filter._id = { $lt: query.cursor };
      }

      const messages = await this.messageModel
        .find(filter)
        .sort({ _id: -1 })
        .limit(query.limit)
        .session(session || null);

      return ok({ messages });
    } catch (error) {
      this.logger.error('Failed to list messages', error);
      return err({ code: 'DB_ERROR', message: 'Failed to list messages' });
    }
  }
}
