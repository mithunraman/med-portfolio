import type {
  Artefact,
  ArtefactListResponse,
  ArtefactStatus,
  CreateArtefactRequest,
  FinaliseArtefactRequest,
  UpdateArtefactStatusRequest,
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

  async getArtefact(id: string): Promise<Artefact> {
    return this.client.get<Artefact>(`/artefacts/${id}`);
  }

  async updateArtefactStatus(id: string, data: UpdateArtefactStatusRequest): Promise<Artefact> {
    return this.client.put<Artefact>(`/artefacts/${id}/status`, data);
  }

  async finaliseArtefact(id: string, data: FinaliseArtefactRequest): Promise<Artefact> {
    return this.client.post<Artefact>(`/artefacts/${id}/finalise`, data);
  }

  async duplicateToReview(id: string): Promise<Artefact> {
    return this.client.post<Artefact>(`/artefacts/${id}/duplicate`, {});
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
