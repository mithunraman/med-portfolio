import type { SpecialtyListResponse } from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class SpecialtiesClient {
  constructor(private readonly client: BaseApiClient) {}

  async getSpecialties(): Promise<SpecialtyListResponse> {
    return this.client.get<SpecialtyListResponse>('/specialties', { mode: 'public' });
  }
}
