import type { Message, MessageListResponse } from '@acme/shared';
import { MessageRole } from '@acme/shared';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { isErr } from '../common/utils/result.util';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from './conversations.repository.interface';
import { ListMessagesDto, SendMessageDto } from './dto';
import { toMessageDto } from './mappers/message.mapper';

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository
  ) {}

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto
  ): Promise<Message> {
    // Find conversation by xid
    const conversationResult = await this.conversationsRepository.findConversationByXid(
      conversationId,
      new Types.ObjectId(userId)
    );

    if (isErr(conversationResult)) {
      throw new InternalServerErrorException(conversationResult.error.message);
    }

    if (!conversationResult.value) {
      throw new NotFoundException('Conversation not found');
    }

    const conversation = conversationResult.value;

    // Create the message
    const messageResult = await this.conversationsRepository.createMessage({
      conversation: conversation._id,
      role: MessageRole.USER,
      content: dto.content,
    });

    if (isErr(messageResult)) {
      throw new InternalServerErrorException(messageResult.error.message);
    }

    return toMessageDto(messageResult.value, conversation.xid);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    query: ListMessagesDto
  ): Promise<MessageListResponse> {
    const limit = query.limit || 50;
    const cursor = query.cursor ? new Types.ObjectId(query.cursor) : undefined;

    // Find conversation by xid
    const conversationResult = await this.conversationsRepository.findConversationByXid(
      conversationId,
      new Types.ObjectId(userId)
    );

    if (isErr(conversationResult)) {
      throw new InternalServerErrorException(conversationResult.error.message);
    }

    if (!conversationResult.value) {
      throw new NotFoundException('Conversation not found');
    }

    const conversation = conversationResult.value;

    // Get messages
    const messagesResult = await this.conversationsRepository.listMessages({
      conversation: conversation._id,
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
      messages: messages.map((msg) => toMessageDto(msg, conversation.xid)),
      nextCursor,
      limit,
    };
  }
}
