import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import { DBError, IQuotaRepository } from './quota.repository.interface';
import { UsageEvent, UsageEventDocument } from './schemas/usage-event.schema';

@Injectable()
export class QuotaRepository implements IQuotaRepository {
  private readonly logger = new Logger(QuotaRepository.name);

  constructor(@InjectModel(UsageEvent.name) private usageEventModel: Model<UsageEventDocument>) {}

  async countSince(userId: Types.ObjectId, since: Date): Promise<Result<number, DBError>> {
    try {
      const count = await this.usageEventModel.countDocuments({
        userId,
        createdAt: { $gte: since },
      });
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count usage events', error);
      return err({ code: 'DB_ERROR', message: 'Failed to count usage events' });
    }
  }

  async recordEvent(
    userId: Types.ObjectId,
    type: string,
    metadata?: Record<string, unknown>
  ): Promise<Result<void, DBError>> {
    try {
      await this.usageEventModel.create({ userId, type, metadata: metadata ?? null });
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to record usage event', error);
      return err({ code: 'DB_ERROR', message: 'Failed to record usage event' });
    }
  }

  async findOldestInWindow(
    userId: Types.ObjectId,
    since: Date
  ): Promise<Result<Date | null, DBError>> {
    try {
      const oldest = await this.usageEventModel
        .findOne({ userId, createdAt: { $gte: since } })
        .sort({ createdAt: 1 })
        .select('createdAt')
        .lean();
      return ok(oldest?.createdAt ?? null);
    } catch (error) {
      this.logger.error('Failed to find oldest usage event', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find oldest usage event' });
    }
  }
}
