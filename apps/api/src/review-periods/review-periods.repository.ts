import { ReviewPeriodStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { DBError } from '../artefacts/artefacts.repository.interface';
import { err, ok, type Result } from '../common/utils/result.util';
import type {
  CreateReviewPeriodData,
  IReviewPeriodsRepository,
  UpdateReviewPeriodData,
} from './review-periods.repository.interface';
import { ReviewPeriod, type ReviewPeriodDocument } from './schemas/review-period.schema';

@Injectable()
export class ReviewPeriodsRepository implements IReviewPeriodsRepository {
  private readonly logger = new Logger(ReviewPeriodsRepository.name);

  constructor(
    @InjectModel(ReviewPeriod.name) private readonly model: Model<ReviewPeriodDocument>
  ) {}

  async create(
    data: CreateReviewPeriodData,
    session?: ClientSession
  ): Promise<Result<ReviewPeriod, DBError>> {
    try {
      const [doc] = await this.model.create([data], { session });
      return ok(doc.toObject());
    } catch (error) {
      this.logger.error('Failed to create review period', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create review period' });
    }
  }

  async findByXid(
    xid: string,
    userId: Types.ObjectId
  ): Promise<Result<ReviewPeriod | null, DBError>> {
    try {
      const doc = await this.model.findOne({ xid, userId }).lean();
      return ok(doc);
    } catch (error) {
      this.logger.error('Failed to find review period', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find review period' });
    }
  }

  async findByUserId(
    userId: Types.ObjectId,
    statuses?: ReviewPeriodStatus[]
  ): Promise<Result<ReviewPeriod[], DBError>> {
    try {
      const filter: Record<string, unknown> = { userId };
      if (statuses && statuses.length > 0) {
        filter.status = { $in: statuses };
      }
      const docs = await this.model.find(filter).sort({ createdAt: -1 }).lean();
      return ok(docs);
    } catch (error) {
      this.logger.error('Failed to find review periods', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find review periods' });
    }
  }

  async findActiveByUserId(
    userId: Types.ObjectId
  ): Promise<Result<ReviewPeriod | null, DBError>> {
    try {
      const doc = await this.model
        .findOne({ userId, status: ReviewPeriodStatus.ACTIVE })
        .lean();
      return ok(doc);
    } catch (error) {
      this.logger.error('Failed to find active review period', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find active review period' });
    }
  }

  async updateByXid(
    xid: string,
    userId: Types.ObjectId,
    data: UpdateReviewPeriodData
  ): Promise<Result<ReviewPeriod | null, DBError>> {
    try {
      const update: Record<string, unknown> = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.startDate !== undefined) update.startDate = data.startDate;
      if (data.endDate !== undefined) update.endDate = data.endDate;
      if (data.status !== undefined) update.status = data.status;

      const doc = await this.model
        .findOneAndUpdate({ xid, userId }, { $set: update }, { new: true })
        .lean();
      return ok(doc);
    } catch (error) {
      this.logger.error('Failed to update review period', error);
      return err({ code: 'DB_ERROR', message: 'Failed to update review period' });
    }
  }
}
