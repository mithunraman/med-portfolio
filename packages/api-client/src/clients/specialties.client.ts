import type { SampleCaseResponse, Specialty, SpecialtyListResponse } from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class SpecialtiesClient {
  constructor(private readonly client: BaseApiClient) {}

  async getSpecialties(): Promise<SpecialtyListResponse> {
    return this.client.get<SpecialtyListResponse>('/specialties', { mode: 'public' });
  }

  async getSampleCase(specialty: Specialty): Promise<SampleCaseResponse> {
    return this.client.get<SampleCaseResponse>(`/specialties/${specialty}/sample-case`, {
      mode: 'public',
    });
  }
}
