import type { Message, MessageListResponse } from '@acme/shared';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { GetPendingMessagesDto, ListMessagesDto, SendMessageDto } from './dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  /**
   * Poll a batch of messages by XID for processing-status updates.
   * Route must be declared before :conversationId routes to avoid param capture.
   */
  @Get('messages/pending')
  async pollMessages(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: GetPendingMessagesDto
  ): Promise<Message[]> {
    return this.conversationsService.pollMessages(user.userId, query.ids);
  }

  @Post(':conversationId/messages')
  async sendMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto
  ): Promise<Message> {
    return this.conversationsService.sendMessage(user.userId, conversationId, dto);
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
