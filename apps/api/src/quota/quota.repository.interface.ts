import { Types } from 'mongoose';
import type { DBError, Result } from '../common/utils/result.util';

export const QUOTA_REPOSITORY = Symbol('QUOTA_REPOSITORY');


export interface IQuotaRepository {
  countSince(userId: Types.ObjectId, since: Date): Promise<Result<number, DBError>>;

  recordEvent(
    userId: Types.ObjectId,
    type: string,
    metadata?: Record<string, unknown>
  ): Promise<Result<void, DBError>>;

  findOldestInWindow(
    userId: Types.ObjectId,
    since: Date
  ): Promise<Result<Date | null, DBError>>;
}
