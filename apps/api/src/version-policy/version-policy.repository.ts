import { Platform } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import { VersionPolicy, VersionPolicyDocument } from './schemas/version-policy.schema';

export interface UpsertVersionPolicyData {
  platform: Platform;
  minimumVersion: string;
  recommendedVersion: string;
  latestVersion: string;
  storeUrl: string;
  message?: string;
}

@Injectable()
export class VersionPolicyRepository {
  private readonly logger = new Logger(VersionPolicyRepository.name);

  constructor(
    @InjectModel(VersionPolicy.name)
    private model: Model<VersionPolicyDocument>
  ) {}

  async findByPlatform(platform: Platform): Promise<Result<VersionPolicy | null, DBError>> {
    try {
      const doc = await this.model.findOne({ platform }).lean();
      return ok(doc);
    } catch (error) {
      this.logger.error('Failed to find version policy', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find version policy' });
    }
  }

  async findAll(): Promise<Result<VersionPolicy[], DBError>> {
    try {
      const docs = await this.model.find().lean();
      return ok(docs);
    } catch (error) {
      this.logger.error('Failed to find version policies', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find version policies' });
    }
  }

  async upsert(data: UpsertVersionPolicyData): Promise<Result<VersionPolicy, DBError>> {
    try {
      const doc = await this.model
        .findOneAndUpdate(
          { platform: data.platform },
          { $set: data },
          { upsert: true, new: true }
        )
        .lean();
      return ok(doc);
    } catch (error) {
      this.logger.error('Failed to upsert version policy', error);
      return err({ code: 'DB_ERROR', message: 'Failed to upsert version policy' });
    }
  }
}
