import type { InitiateUploadRequest, InitiateUploadResult } from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class MediaClient {
  constructor(private readonly client: BaseApiClient) {}

  async initiateUpload(data: InitiateUploadRequest): Promise<InitiateUploadResult> {
    return this.client.post<InitiateUploadResult>('/media/initiate', data);
  }
}
