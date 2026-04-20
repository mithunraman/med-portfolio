import { BaseApiClient } from '../core/api-client';

export class NoticesClient {
  constructor(private readonly client: BaseApiClient) {}

  async dismiss(noticeId: string): Promise<void> {
    await this.client.post<void>(`/notices/${noticeId}/dismiss`, {});
  }
}
