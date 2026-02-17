import { ConversationStatus } from '@acme/shared';
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
  ): Promise<Result<ConversationDocument, DBError>> {
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

  async findConversationByXid(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<ConversationDocument | null, DBError>> {
    try {
      const conversation = await this.conversationModel
        .findOne({ xid, userId })
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
  ): Promise<Result<ConversationDocument | null, DBError>> {
    try {
      const conversation = await this.conversationModel
        .findOne({ artefact: artefactId, status: ConversationStatus.ACTIVE })
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
  ): Promise<Result<Map<string, ConversationDocument>, DBError>> {
    try {
      const conversations = await this.conversationModel
        .find({
          artefact: { $in: artefactIds },
          status: ConversationStatus.ACTIVE,
        })
        .session(session || null);

      const conversationMap = new Map<string, ConversationDocument>();
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
