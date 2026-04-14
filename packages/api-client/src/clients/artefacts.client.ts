import type {
  Artefact,
  ArtefactListResponse,
  ArtefactStatus,
  ArtefactVersionHistoryResponse,
  CreateArtefactRequest,
  EditArtefactRequest,
  FinaliseArtefactRequest,
  RestoreArtefactVersionRequest,
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

  async editArtefact(id: string, data: EditArtefactRequest): Promise<Artefact> {
    return this.client.patch<Artefact>(`/artefacts/${id}`, data);
  }

  async getVersionHistory(id: string): Promise<ArtefactVersionHistoryResponse> {
    return this.client.get<ArtefactVersionHistoryResponse>(`/artefacts/${id}/versions`);
  }

  async restoreVersion(id: string, data: RestoreArtefactVersionRequest): Promise<Artefact> {
    return this.client.post<Artefact>(`/artefacts/${id}/versions/restore`, data);
  }

  async deleteArtefact(id: string): Promise<{ message: string }> {
    return this.client.delete<{ message: string }>(`/artefacts/${id}`);
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
