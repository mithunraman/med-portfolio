import type { ConversationListResponse, Message, MessageListResponse } from '@acme/shared';
import { MessageRole } from '@acme/shared';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { isErr } from '../common/utils/result.util';
import { TransactionService } from '../database';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from './conversations.repository.interface';
import { ListConversationsDto, ListMessagesDto, SendMessageDto } from './dto';
import { toConversationDto } from './mappers/conversation.mapper';
import { toMessageDto } from './mappers/message.mapper';
import { createInternalConversationId } from './utils/conversation-id.util';

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository,
    private readonly transactionService: TransactionService
  ) {}

  async sendMessage(userId: string, dto: SendMessageDto): Promise<Message> {
    const conversationId = createInternalConversationId(userId, dto.conversationId);

    return this.transactionService.withTransaction(
      async (session) => {
        // Upsert conversation (create if doesn't exist)
        const conversationResult = await this.conversationsRepository.upsertConversation(
          {
            conversationId,
            userId: new Types.ObjectId(userId),
            title: 'New Conversation',
          },
          session
        );

        if (isErr(conversationResult)) {
          throw new InternalServerErrorException(conversationResult.error.message);
        }

        // Create the message
        const messageResult = await this.conversationsRepository.createMessage(
          {
            conversation: conversationResult.value._id,
            role: MessageRole.USER,
            content: dto.content,
          },
          session
        );

        if (isErr(messageResult)) {
          throw new InternalServerErrorException(messageResult.error.message);
        }

        return toMessageDto(messageResult.value, dto.conversationId);
      },
      { context: 'sendMessage' }
    );
  }

  async listConversations(
    userId: string,
    query: ListConversationsDto
  ): Promise<ConversationListResponse> {
    const limit = query.limit || 20;
    const cursor = query.cursor ? new Types.ObjectId(query.cursor) : undefined;

    const result = await this.conversationsRepository.listConversations({
      userId: new Types.ObjectId(userId),
      cursor,
      limit,
    });

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    const conversations = result.value.conversations;
    const hasMore = conversations.length === limit;
    const nextCursor = hasMore ? conversations[conversations.length - 1]._id.toString() : null;

    return {
      conversations: conversations.map(toConversationDto),
      nextCursor,
      limit,
    };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    query: ListMessagesDto
  ): Promise<MessageListResponse> {
    const limit = query.limit || 50;
    const cursor = query.cursor ? new Types.ObjectId(query.cursor) : undefined;
    const internalConversationId = createInternalConversationId(userId, conversationId);

    // Verify user owns this conversation
    const conversationResult = await this.conversationsRepository.findConversationById(
      internalConversationId,
      new Types.ObjectId(userId)
    );

    if (isErr(conversationResult)) {
      throw new InternalServerErrorException(conversationResult.error.message);
    }

    if (!conversationResult.value) {
      throw new NotFoundException('Conversation not found');
    }

    // Get messages
    const messagesResult = await this.conversationsRepository.listMessages({
      conversation: conversationResult.value._id,
      cursor,
      limit,
    });

    if (isErr(messagesResult)) {
      throw new InternalServerErrorException(messagesResult.error.message);
    }

    const messages = messagesResult.value.messages;
    const hasMore = messages.length === limit;
    const nextCursor = hasMore ? messages[messages.length - 1]._id.toString() : null;

    return {
      messages: messages.map((msg) => toMessageDto(msg, conversationId)),
      nextCursor,
      limit,
    };
  }
}
