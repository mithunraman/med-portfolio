import type { CreditInfoResponse } from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class QuotaClient {
  constructor(private readonly client: BaseApiClient) {}

  async getCreditInfo(): Promise<CreditInfoResponse> {
    return this.client.get<CreditInfoResponse>('/quota/info');
  }
}
