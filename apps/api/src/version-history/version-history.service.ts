import type { VersionHistoryEntity } from '@acme/shared';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { isErr, unwrapVoid } from '../common/utils/result.util';
import type { VersionHistory } from './schemas/version-history.schema';
import {
  IVersionHistoryRepository,
  VERSION_HISTORY_REPOSITORY,
} from './version-history.repository.interface';

@Injectable()
export class VersionHistoryService {
  constructor(
    @Inject(VERSION_HISTORY_REPOSITORY)
    private readonly versionHistoryRepository: IVersionHistoryRepository
  ) {}

  async createVersion(
    entityType: VersionHistoryEntity,
    entityId: Types.ObjectId,
    userId: Types.ObjectId,
    snapshot: Record<string, unknown>,
    session?: ClientSession
  ): Promise<void> {
    const countResult = await this.versionHistoryRepository.countByEntity(
      entityType,
      entityId,
      userId,
      session
    );

    if (isErr(countResult)) {
      throw new InternalServerErrorException(countResult.error.message);
    }

    const version = countResult.value + 1;

    const createResult = await this.versionHistoryRepository.createVersion(
      {
        entityType,
        entityId,
        userId,
        version,
        timestamp: new Date(),
        snapshot,
      },
      session
    );

    if (isErr(createResult)) {
      throw new InternalServerErrorException(createResult.error.message);
    }
  }

  async getVersions(
    entityType: VersionHistoryEntity,
    entityId: Types.ObjectId,
    userId: Types.ObjectId
  ): Promise<VersionHistory[]> {
    const result = await this.versionHistoryRepository.findByEntity(entityType, entityId, userId);

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    return result.value;
  }

  async getVersion(
    entityType: VersionHistoryEntity,
    entityId: Types.ObjectId,
    userId: Types.ObjectId,
    version: number,
    session?: ClientSession
  ): Promise<VersionHistory | null> {
    const result = await this.versionHistoryRepository.findVersion(
      entityType,
      entityId,
      userId,
      version,
      session
    );

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    return result.value;
  }

  async countVersions(
    entityType: VersionHistoryEntity,
    entityId: Types.ObjectId,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<number> {
    const result = await this.versionHistoryRepository.countByEntity(
      entityType,
      entityId,
      userId,
      session
    );

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    return result.value;
  }

  /**
   * Cascade entry point: scrub snapshot fields for the given entityType + entityIds.
   */
  async anonymizeByEntity(
    entityType: VersionHistoryEntity,
    entityIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<void> {
    unwrapVoid(
      await this.versionHistoryRepository.anonymizeByEntity(entityType, entityIds, session)
    );
  }
}
