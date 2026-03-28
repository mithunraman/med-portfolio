import type { InitResponse } from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class InitClient {
  constructor(private readonly client: BaseApiClient) {}

  async getInit(): Promise<InitResponse> {
    return this.client.get<InitResponse>('/init');
  }
}
