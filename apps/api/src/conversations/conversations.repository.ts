import { ArtefactStatus, ConversationStatus, MessageStatus, MessageRole } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import {
  CreateConversationData,
  CreateMessageData,
  IConversationsRepository,
  ListMessagesQuery,
  ListMessagesResult,
  UpdateMessageData,
} from './conversations.repository.interface';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';

/**
 * Single source of truth for the Conversation tombstone payload.
 */
export function conversationTombstoneUpdate() {
  return {
    $set: {
      title: '[deleted]',
      status: ConversationStatus.DELETED,
    },
  };
}

/**
 * Canonical "live" filters for read paths — exclude tombstones.
 * Cascade-write call sites keep their inline `$ne` because that's idempotency
 * semantics ("don't re-tombstone"), not the read-time "exclude deleted" rule.
 */
const CONVERSATION_LIVE_FILTER = { status: { $ne: ConversationStatus.DELETED } } as const;
const MESSAGE_LIVE_FILTER = { status: { $ne: MessageStatus.DELETED } } as const;

/**
 * Single source of truth for the Message tombstone update — covers both
 * scrubbed `$set` fields and the `$unset` block (question/answer/media).
 * Used by every message-deletion path on this repo.
 */
export function messageTombstoneUpdate() {
  return {
    $set: {
      rawContent: '[deleted]',
      cleanedContent: '[deleted]',
      content: '[deleted]',
      status: MessageStatus.DELETED,
    },
    $unset: { question: '', answer: '', media: '' },
  };
}

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
        .findOne({ _id: conversationId, ...CONVERSATION_LIVE_FILTER })
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
        .findOne({ xid, userId, ...CONVERSATION_LIVE_FILTER })
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
      // Guard against resurrecting a tombstoned message. A delete can race an
      // in-flight (or still-queued) processing pipeline; a blind write by _id
      // would flip a DELETED row back to COMPLETE and rewrite scrubbed content.
      // Folding MESSAGE_LIVE_FILTER into the query makes the precondition atomic
      // with the write. Returns null when the message is missing or deleted —
      // callers treat that as a no-op.
      const message = await this.messageModel
        .findOneAndUpdate({ _id: messageId, ...MESSAGE_LIVE_FILTER }, { $set: data }, { new: true })
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
        .find({ conversation: query.conversation, ...MESSAGE_LIVE_FILTER })
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
          status: { $gt: MessageStatus.DELETED, $lt: MessageStatus.COMPLETE },
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
        .findOne({ conversation: conversationId, ...MESSAGE_LIVE_FILTER })
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

  async hasLaterAssistantMessage(
    conversationId: Types.ObjectId,
    messageId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<boolean, DBError>> {
    try {
      // _id is monotonic by insertion, and an assistant message is always
      // created after the messages it consumed — so "_id greater than target"
      // reliably means "the AI responded after this message". We match ANY live
      // later assistant message, not just question-bearing ones: terminal
      // verdicts (irrelevant classification / empty capabilities) carry no
      // question yet still mean the AI has responded past this point. Indexed by
      // the existing { conversation: 1, _id: -1 } compound index.
      const existing = await this.messageModel
        .exists({
          conversation: conversationId,
          role: MessageRole.ASSISTANT,
          ...MESSAGE_LIVE_FILTER,
          _id: { $gt: messageId },
        })
        .session(session || null);
      return ok(existing !== null);
    } catch (error) {
      this.logger.error('Failed to check for later assistant message', error);
      return err({ code: 'DB_ERROR', message: 'Failed to check for later assistant message' });
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

  async findArtefactRefByConversationId(
    conversationId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<{ xid: string; status: ArtefactStatus } | null, DBError>> {
    try {
      const conversation = await this.conversationModel
        .findById(conversationId)
        .populate('artefact', 'xid status')
        .lean()
        .session(session || null);

      if (!conversation) return ok(null);

      const artefact = conversation.artefact as unknown as {
        xid: string;
        status: ArtefactStatus;
      } | null;
      return ok(artefact ? { xid: artefact.xid, status: artefact.status } : null);
    } catch (error) {
      this.logger.error('Failed to find artefact ref by conversation id', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find artefact ref' });
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

  async markDeletedByUserId(userId: Types.ObjectId): Promise<Result<number, DBError>> {
    try {
      const convResult = await this.conversationModel.updateMany(
        { userId, status: { $ne: ConversationStatus.DELETED } },
        conversationTombstoneUpdate()
      );
      const msgResult = await this.messageModel.updateMany(
        { userId, status: { $ne: MessageStatus.DELETED } },
        messageTombstoneUpdate()
      );
      return ok(convResult.modifiedCount + msgResult.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to anonymize conversations', error);
      return err({ code: 'DB_ERROR', message: 'Failed to anonymize conversations' });
    }
  }

  async markDeleted(
    ids: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (ids.length === 0) return ok(0);
    try {
      const result = await this.conversationModel.updateMany(
        { _id: { $in: ids }, status: { $ne: ConversationStatus.DELETED } },
        conversationTombstoneUpdate(),
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark conversations deleted', error);
      return err({ code: 'DB_ERROR', message: 'Failed to mark conversations deleted' });
    }
  }

  /**
   * Cascade resolver: returns ALL conversation IDs for the given artefacts,
   * including already-tombstoned ones. Deliberately does NOT filter
   * `status: { $ne: DELETED }` — on retry of a partial cascade, the
   * conversation may already be DELETED while its children (messages, media)
   * are not. Re-cascading through them requires the tombstoned IDs.
   * Do not add a status filter "for consistency" with other finders.
   */
  async findIdsByArtefactIds(
    artefactIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<Types.ObjectId[], DBError>> {
    if (artefactIds.length === 0) return ok([]);
    try {
      const ids = await this.conversationModel
        .find({ artefact: { $in: artefactIds } })
        .distinct('_id')
        .session(session ?? null);
      return ok(ids);
    } catch (error) {
      this.logger.error('Failed to find conversation ids by artefact ids', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find conversation ids by artefact ids' });
    }
  }

  async markDeletedMessagesByIds(
    ids: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (ids.length === 0) return ok(0);
    try {
      const result = await this.messageModel.updateMany(
        { _id: { $in: ids }, status: { $ne: MessageStatus.DELETED } },
        messageTombstoneUpdate(),
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark messages deleted by ids', error);
      return err({ code: 'DB_ERROR', message: 'Failed to mark messages deleted by ids' });
    }
  }

  async markDeletedMessagesByConversationIds(
    conversationIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    if (conversationIds.length === 0) return ok(0);
    try {
      const result = await this.messageModel.updateMany(
        {
          conversation: { $in: conversationIds },
          status: { $ne: MessageStatus.DELETED },
        },
        messageTombstoneUpdate(),
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark messages deleted by conversation ids', error);
      return err({
        code: 'DB_ERROR',
        message: 'Failed to mark messages deleted by conversation ids',
      });
    }
  }

  async findMessageIdsByConversationIds(
    conversationIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<Types.ObjectId[], DBError>> {
    if (conversationIds.length === 0) return ok([]);
    try {
      const ids = await this.messageModel
        .find({ conversation: { $in: conversationIds } })
        .distinct('_id')
        .session(session ?? null);
      return ok(ids);
    } catch (error) {
      this.logger.error('Failed to find message ids by conversation ids', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find message ids by conversation ids' });
    }
  }
}
