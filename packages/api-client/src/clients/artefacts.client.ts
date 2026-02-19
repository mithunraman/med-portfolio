import type { Artefact, CreateArtefactRequest } from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class ArtefactsClient {
  constructor(private readonly client: BaseApiClient) {}

  async createArtefact(data: CreateArtefactRequest): Promise<Artefact> {
    return this.client.post<Artefact>('/artefacts', data);
  }
}
