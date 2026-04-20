import { ReviewPeriodStatus } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { DBError, Result } from '../common/utils/result.util';
import type { ReviewPeriod } from './schemas/review-period.schema';

export const REVIEW_PERIODS_REPOSITORY = Symbol('REVIEW_PERIODS_REPOSITORY');

export interface CreateReviewPeriodData {
  userId: Types.ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface UpdateReviewPeriodData {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  status?: ReviewPeriodStatus;
}

export interface IReviewPeriodsRepository {
  create(
    data: CreateReviewPeriodData,
    session?: ClientSession
  ): Promise<Result<ReviewPeriod, DBError>>;

  findByXid(
    xid: string,
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<ReviewPeriod | null, DBError>>;

  findByUserId(
    userId: Types.ObjectId,
    statuses?: ReviewPeriodStatus[]
  ): Promise<Result<ReviewPeriod[], DBError>>;

  findActiveByUserId(
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<Result<ReviewPeriod | null, DBError>>;

  updateByXid(
    xid: string,
    userId: Types.ObjectId,
    data: UpdateReviewPeriodData,
    session?: ClientSession
  ): Promise<Result<ReviewPeriod | null, DBError>>;

  anonymizeByUser(userId: Types.ObjectId): Promise<Result<number, DBError>>;
}
