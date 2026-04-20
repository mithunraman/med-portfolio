import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import {
  CreateVersionData,
  IVersionHistoryRepository,
} from './version-history.repository.interface';
import { VersionHistory, VersionHistoryDocument } from './schemas/version-history.schema';

@Injectable()
export class VersionHistoryRepository implements IVersionHistoryRepository {
  private readonly logger = new Logger(VersionHistoryRepository.name);

  constructor(
    @InjectModel(VersionHistory.name)
    private versionHistoryModel: Model<VersionHistoryDocument>
  ) {}

  async createVersion(
    data: CreateVersionData,
    session?: ClientSession
  ): Promise<Result<VersionHistory, DBError>> {
    try {
      const [version] = await this.versionHistoryModel.create(
        [
          {
            entityType: data.entityType,
            entityId: data.entityId,
            userId: data.userId,
            version: data.version,
            timestamp: data.timestamp,
            snapshot: data.snapshot,
          },
        ],
        { session }
      );
      return ok(version.toObject());
    } catch (error) {
      this.logger.error('Failed to create version', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create version' });
    }
  }

  async findByEntity(
    entityType: string,
    entityId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<VersionHistory[], DBError>> {
    try {
      const versions = await this.versionHistoryModel
        .find({ entityType, entityId })
        .sort({ version: -1 })
        .lean()
        .session(session || null);
      return ok(versions);
    } catch (error) {
      this.logger.error('Failed to find versions', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find versions' });
    }
  }

  async findVersion(
    entityType: string,
    entityId: Types.ObjectId,
    version: number,
    session?: ClientSession
  ): Promise<Result<VersionHistory | null, DBError>> {
    try {
      const versionDoc = await this.versionHistoryModel
        .findOne({ entityType, entityId, version })
        .lean()
        .session(session || null);
      return ok(versionDoc);
    } catch (error) {
      this.logger.error('Failed to find version', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find version' });
    }
  }

  async countByEntity(
    entityType: string,
    entityId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    try {
      const count = await this.versionHistoryModel
        .countDocuments({ entityType, entityId })
        .session(session || null);
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count versions', error);
      return err({ code: 'DB_ERROR', message: 'Failed to count versions' });
    }
  }

  async deleteByUser(userId: Types.ObjectId): Promise<Result<number, DBError>> {
    try {
      const result = await this.versionHistoryModel.deleteMany({ userId });
      return ok(result.deletedCount);
    } catch (error) {
      this.logger.error('Failed to delete version history', error);
      return err({ code: 'DB_ERROR', message: 'Failed to delete version history' });
    }
  }
}
