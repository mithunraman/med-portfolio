import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { isErr } from '../common/utils/result.util';
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
    entityType: string,
    entityId: Types.ObjectId,
    userId: Types.ObjectId,
    snapshot: Record<string, unknown>,
    session?: ClientSession
  ): Promise<void> {
    const countResult = await this.versionHistoryRepository.countByEntity(
      entityType,
      entityId,
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

  async getVersions(entityType: string, entityId: Types.ObjectId): Promise<VersionHistory[]> {
    const result = await this.versionHistoryRepository.findByEntity(entityType, entityId);

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    return result.value;
  }

  async getVersion(
    entityType: string,
    entityId: Types.ObjectId,
    version: number,
    session?: ClientSession
  ): Promise<VersionHistory | null> {
    const result = await this.versionHistoryRepository.findVersion(entityType, entityId, version, session);

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    return result.value;
  }

  async countVersions(
    entityType: string,
    entityId: Types.ObjectId,
    session?: ClientSession
  ): Promise<number> {
    const result = await this.versionHistoryRepository.countByEntity(entityType, entityId, session);

    if (isErr(result)) {
      throw new InternalServerErrorException(result.error.message);
    }

    return result.value;
  }
}
