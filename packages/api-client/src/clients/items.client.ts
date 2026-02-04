import type { Item, CreateItemDto, UpdateItemDto, ItemListResponse } from '@acme/shared';
import { ItemStatus } from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export interface ListItemsParams {
  page?: number;
  limit?: number;
  status?: ItemStatus;
}

export class ItemsClient {
  constructor(private readonly client: BaseApiClient) {}

  async list(params?: ListItemsParams): Promise<ItemListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page !== undefined) searchParams.set('page', String(params.page));
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.status !== undefined) searchParams.set('status', String(params.status));

    const query = searchParams.toString();
    return this.client.get<ItemListResponse>(`/items${query ? `?${query}` : ''}`);
  }

  async getById(id: string): Promise<Item> {
    return this.client.get<Item>(`/items/${id}`);
  }

  async create(dto: CreateItemDto): Promise<Item> {
    return this.client.post<Item>('/items', dto);
  }

  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    return this.client.patch<Item>(`/items/${id}`, dto);
  }

  async delete(id: string): Promise<void> {
    return this.client.delete<void>(`/items/${id}`);
  }

  async updateStatus(id: string, status: ItemStatus): Promise<Item> {
    return this.client.patch<Item>(`/items/${id}/status`, { status });
  }
}
