import type { AcknowledgementId } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { isMongoDuplicateKeyError } from '../common/utils/mongo-errors.util';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import { Acknowledgement, AcknowledgementDocument } from './schemas/acknowledgement.schema';

export interface AcknowledgementEntryInput {
  id: AcknowledgementId;
  given: boolean;
}

export interface CreateAcknowledgementData {
  userId: string;
  noticeVersion: string;
  acknowledgements: AcknowledgementEntryInput[];
  ip: string | null;
  userAgent: string | null;
}

export type DuplicateKeyError = { code: 'DUPLICATE_KEY'; message: string };

@Injectable()
export class AcknowledgementsRepository {
  private readonly logger = new Logger(AcknowledgementsRepository.name);

  constructor(
    @InjectModel(Acknowledgement.name)
    private readonly model: Model<AcknowledgementDocument>
  ) {}

  async create(
    data: CreateAcknowledgementData
  ): Promise<Result<Acknowledgement, DBError | DuplicateKeyError>> {
    try {
      const doc = await this.model.create({
        userId: new Types.ObjectId(data.userId),
        noticeVersion: data.noticeVersion,
        acknowledgements: data.acknowledgements,
        ip: data.ip,
        userAgent: data.userAgent,
      });
      return ok(doc.toObject());
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        return err({ code: 'DUPLICATE_KEY', message: 'Acknowledgement already exists' });
      }
      this.logger.error('Failed to create acknowledgement', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create acknowledgement' });
    }
  }

  async findByUserAndVersion(
    userId: string,
    noticeVersion: string
  ): Promise<Result<Acknowledgement | null, DBError>> {
    try {
      const doc = await this.model
        .findOne({ userId: new Types.ObjectId(userId), noticeVersion })
        .lean();
      return ok(doc);
    } catch (error) {
      this.logger.error('Failed to find acknowledgement', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find acknowledgement' });
    }
  }

  async findAcknowledgedVersions(userId: string): Promise<Result<string[], DBError>> {
    try {
      const versions = await this.model.distinct('noticeVersion', {
        userId: new Types.ObjectId(userId),
      });
      return ok(versions);
    } catch (error) {
      this.logger.error('Failed to find acknowledged versions', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find acknowledged versions' });
    }
  }
}
