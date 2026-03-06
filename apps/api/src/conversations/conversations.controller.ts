import type { AnalysisActionRequest, Message, MessageListResponse } from '@acme/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { AnalysisActionPipe, SendMessageDto } from './dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post(':conversationId/messages')
  async sendMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto
  ): Promise<Message> {
    return this.conversationsService.sendMessage(user.userId, conversationId, dto);
  }

  @Post(':conversationId/analysis')
  @HttpCode(HttpStatus.NO_CONTENT)
  async analysis(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string,
    @Body(new AnalysisActionPipe()) dto: AnalysisActionRequest
  ): Promise<void> {
    await this.conversationsService.handleAnalysis(user.userId, conversationId, dto);
  }

  @Get(':conversationId/messages')
  async listMessages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string,
  ): Promise<MessageListResponse> {
    return this.conversationsService.listMessages(user.userId, conversationId);
  }
}
