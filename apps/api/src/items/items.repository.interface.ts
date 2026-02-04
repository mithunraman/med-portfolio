import { ClientSession, Types } from 'mongoose';
import { ItemStatus } from '@acme/shared';
import type { Result } from '../common/utils/result.util';
import type { ItemDocument } from './schemas/item.schema';

export const ITEMS_REPOSITORY = Symbol('ITEMS_REPOSITORY');

export interface CreateItemData {
  userId: Types.ObjectId;
  name: string;
  description?: string;
}

export interface UpdateItemData {
  name?: string;
  description?: string;
  status?: ItemStatus;
}

export interface ListItemsQuery {
  userId: Types.ObjectId;
  status?: ItemStatus;
  page: number;
  limit: number;
}

export interface ListItemsResult {
  items: ItemDocument[];
  total: number;
}

export interface DBError {
  code: string;
  message: string;
}

export interface IItemsRepository {
  create(data: CreateItemData, session?: ClientSession): Promise<Result<ItemDocument, DBError>>;
  findById(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<ItemDocument | null, DBError>>;
  findByUserId(query: ListItemsQuery, session?: ClientSession): Promise<Result<ListItemsResult, DBError>>;
  update(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    data: UpdateItemData,
    session?: ClientSession,
  ): Promise<Result<ItemDocument | null, DBError>>;
  delete(
    id: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<Result<boolean, DBError>>;
}
