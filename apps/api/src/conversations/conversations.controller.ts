import type {
  AnalysisActionRequest,
  ConversationContext,
  Message,
  MessageListResponse,
} from '@acme/shared';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { UseQuota } from '../common/decorators/use-quota.decorator';
import { ConversationsService } from './conversations.service';
import { AnalysisActionPipe, SendMessageDto } from './dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @UseQuota('message')
  @Post(':conversationId/messages')
  async sendMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto
  ): Promise<Message> {
    return this.conversationsService.sendMessage(user.userId, conversationId, dto);
  }

  @UseQuota('analysis')
  @Post(':conversationId/analysis')
  async analysis(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string,
    @Body(new AnalysisActionPipe()) dto: AnalysisActionRequest
  ): Promise<ConversationContext> {
    return this.conversationsService.handleAnalysis(user.userId, conversationId, dto);
  }

  @Get(':conversationId/messages')
  async listMessages(
    @CurrentUser() user: CurrentUserPayload,
    @Param('conversationId') conversationId: string
  ): Promise<MessageListResponse> {
    return this.conversationsService.listMessages(user.userId, conversationId);
  }
}
