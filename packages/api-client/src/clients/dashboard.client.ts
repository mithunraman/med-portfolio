import type { DashboardResponse } from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class DashboardClient {
  constructor(private readonly client: BaseApiClient) {}

  async getDashboard(): Promise<DashboardResponse> {
    return this.client.get<DashboardResponse>('/dashboard');
  }
}
