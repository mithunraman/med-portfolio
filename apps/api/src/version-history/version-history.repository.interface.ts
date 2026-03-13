import { ClientSession, Types } from 'mongoose';
import type { Result } from '../common/utils/result.util';
import type { VersionHistory } from './schemas/version-history.schema';

export const VERSION_HISTORY_REPOSITORY = Symbol('VERSION_HISTORY_REPOSITORY');

export interface DBError {
  code: string;
  message: string;
}

export interface CreateVersionData {
  entityType: string;
  entityId: Types.ObjectId;
  userId: Types.ObjectId;
  version: number;
  timestamp: Date;
  snapshot: Record<string, unknown>;
}

export interface IVersionHistoryRepository {
  createVersion(
    data: CreateVersionData,
    session?: ClientSession
  ): Promise<Result<VersionHistory, DBError>>;

  findByEntity(
    entityType: string,
    entityId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<VersionHistory[], DBError>>;

  findVersion(
    entityType: string,
    entityId: Types.ObjectId,
    version: number,
    session?: ClientSession
  ): Promise<Result<VersionHistory | null, DBError>>;

  countByEntity(
    entityType: string,
    entityId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>>;
}
