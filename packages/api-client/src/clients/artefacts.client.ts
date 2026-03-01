import type {
  Artefact,
  ArtefactListResponse,
  ArtefactStatus,
  CreateArtefactRequest,
} from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export interface ListArtefactsParams {
  limit?: number;
  cursor?: string;
  status?: ArtefactStatus;
}

export class ArtefactsClient {
  constructor(private readonly client: BaseApiClient) {}

  async createArtefact(data: CreateArtefactRequest): Promise<Artefact> {
    return this.client.post<Artefact>('/artefacts', data);
  }

  async listArtefacts(params?: ListArtefactsParams): Promise<ArtefactListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.cursor !== undefined) searchParams.set('cursor', params.cursor);
    if (params?.status !== undefined) searchParams.set('status', String(params.status));

    const query = searchParams.toString();
    return this.client.get<ArtefactListResponse>(`/artefacts${query ? `?${query}` : ''}`);
  }
}
