import type { ConversationListResponse, Message, MessageListResponse } from '@acme/shared';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { ListConversationsDto, ListMessagesDto, SendMessageDto } from './dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post('messages')
  async sendMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SendMessageDto
  ): Promise<Message> {
    return this.conversationsService.sendMessage(user.userId, dto);
  }

  @Get()
  async listConversations(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListConversationsDto
  ): Promise<ConversationListResponse> {
    return this.conversationsService.listConversations(user.userId, query);
  }

  @Get(':conversationId/messages')
  async listMessages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string,
    @Query() query: ListMessagesDto
  ): Promise<MessageListResponse> {
    return this.conversationsService.listMessages(user.userId, conversationId, query);
  }
}
