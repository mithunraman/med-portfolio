import type {
  ConversationListResponse,
  Message,
  MessageListResponse,
  SendMessageRequest,
} from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export interface ListConversationsParams {
  limit?: number;
  cursor?: string;
}

export interface ListMessagesParams {
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

  async listMessages(
    conversationId: string,
    params?: ListMessagesParams
  ): Promise<MessageListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.cursor !== undefined) searchParams.set('cursor', params.cursor);

    const query = searchParams.toString();
    return this.client.get<MessageListResponse>(
      `/conversations/${conversationId}/messages${query ? `?${query}` : ''}`
    );
  }

  async sendMessage(data: SendMessageRequest): Promise<Message> {
    return this.client.post<Message>('/conversations/messages', data);
  }
}
