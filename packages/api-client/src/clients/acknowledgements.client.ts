import type {
  AcknowledgementResponse,
  CreateAcknowledgementRequest,
} from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class AcknowledgementsClient {
  constructor(private readonly client: BaseApiClient) {}

  async createAcknowledgement(
    body: CreateAcknowledgementRequest
  ): Promise<AcknowledgementResponse> {
    return this.client.post<AcknowledgementResponse>('/acknowledgements', body);
  }
}
