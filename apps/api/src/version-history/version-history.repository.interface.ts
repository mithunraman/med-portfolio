import type { VersionHistoryEntity } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { DBError, Result } from '../common/utils/result.util';
import type { VersionHistory } from './schemas/version-history.schema';

export const VERSION_HISTORY_REPOSITORY = Symbol('VERSION_HISTORY_REPOSITORY');


export interface CreateVersionData {
  entityType: VersionHistoryEntity;
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
    entityType: VersionHistoryEntity,
    entityId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<VersionHistory[], DBError>>;

  findVersion(
    entityType: VersionHistoryEntity,
    entityId: Types.ObjectId,
    userId: Types.ObjectId,
    version: number,
    session?: ClientSession
  ): Promise<Result<VersionHistory | null, DBError>>;

  countByEntity(
    entityType: VersionHistoryEntity,
    entityId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>>;

  deleteByUserId(userId: Types.ObjectId): Promise<Result<number, DBError>>;

  /**
   * Anonymize version-history rows for the given entityType + entityIds by
   * scrubbing snapshot to empty. Idempotent.
   */
  anonymizeByEntity(
    entityType: VersionHistoryEntity,
    entityIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>>;
}
