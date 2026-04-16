import type {
  AddPdpGoalActionRequest,
  ListPdpGoalsResponse,
  PdpGoalResponse,
  PdpGoalStatus,
  UpdatePdpGoalActionRequest,
  UpdatePdpGoalRequest,
} from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class PdpGoalsClient {
  constructor(private readonly client: BaseApiClient) {}

  async deleteGoal(goalId: string): Promise<{ message: string }> {
    return this.client.delete<{ message: string }>(`/pdp-goals/${goalId}`);
  }

  async listGoals(params?: {
    statuses?: PdpGoalStatus[];
    cursor?: string;
    limit?: number;
  }): Promise<ListPdpGoalsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.statuses?.length) searchParams.set('status', params.statuses.join(','));
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return this.client.get<ListPdpGoalsResponse>(`/pdp-goals${query ? `?${query}` : ''}`);
  }

  async getGoal(goalId: string): Promise<PdpGoalResponse> {
    return this.client.get<PdpGoalResponse>(`/pdp-goals/${goalId}`);
  }

  async updateGoal(goalId: string, data: UpdatePdpGoalRequest): Promise<PdpGoalResponse> {
    return this.client.patch<PdpGoalResponse>(`/pdp-goals/${goalId}`, data);
  }

  async addAction(goalId: string, data: AddPdpGoalActionRequest): Promise<PdpGoalResponse> {
    return this.client.post<PdpGoalResponse>(`/pdp-goals/${goalId}/actions`, data);
  }

  async updateAction(
    goalId: string,
    actionId: string,
    data: UpdatePdpGoalActionRequest
  ): Promise<PdpGoalResponse> {
    return this.client.patch<PdpGoalResponse>(`/pdp-goals/${goalId}/actions/${actionId}`, data);
  }
}
