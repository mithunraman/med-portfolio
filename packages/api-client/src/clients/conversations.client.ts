import type {
  AnalysisActionRequest,
  ConversationContext,
  ConversationListResponse,
  EditMessageRequest,
  Message,
  MessageListResponse,
  SendMessageRequest,
} from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export interface ListConversationsParams {
  limit?: number;
  cursor?: string;
}

export class ConversationsClient {
  constructor(private readonly client: BaseApiClient) {}

  async listConversations(params?: ListConversationsParams): Promise<ConversationListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.cursor !== undefined) searchParams.set('cursor', params.cursor);

    const query = searchParams.toString();
    return this.client.get<ConversationListResponse>(`/conversations${query ? `?${query}` : ''}`);
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    await this.client.delete(`/conversations/${conversationId}/messages/${messageId}`);
  }

  async listMessages(conversationId: string): Promise<MessageListResponse> {
    return this.client.get<MessageListResponse>(
      `/conversations/${conversationId}/messages`
    );
  }

  async sendMessage(conversationId: string, data: SendMessageRequest): Promise<Message> {
    return this.client.post<Message>(`/conversations/${conversationId}/messages`, data);
  }

  async editMessage(
    conversationId: string,
    messageId: string,
    data: EditMessageRequest
  ): Promise<Message> {
    return this.client.patch<Message>(
      `/conversations/${conversationId}/messages/${messageId}`,
      data
    );
  }

  async analysis(conversationId: string, data: AnalysisActionRequest): Promise<ConversationContext> {
    return this.client.post<ConversationContext>(`/conversations/${conversationId}/analysis`, data);
  }
}
