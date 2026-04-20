import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import { Notice, NoticeDocument } from './schemas/notice.schema';
import { NoticeDismissal, NoticeDismissalDocument } from './schemas/notice-dismissal.schema';

export interface CreateNoticeData {
  type: string;
  severity: string;
  title: string;
  body?: string;
  actionUrl?: string;
  actionLabel?: string;
  dismissible: boolean;
  startsAt: Date;
  expiresAt?: Date | null;
  active: boolean;
  audienceType: string;
  audienceRoles?: number[];
  audienceUserIds?: string[];
  priority: number;
}

@Injectable()
export class NoticesRepository {
  private readonly logger = new Logger(NoticesRepository.name);

  constructor(
    @InjectModel(Notice.name) private noticeModel: Model<NoticeDocument>,
    @InjectModel(NoticeDismissal.name) private dismissalModel: Model<NoticeDismissalDocument>
  ) {}

  async findActive(now: Date): Promise<Result<Notice[], DBError>> {
    try {
      const docs = await this.noticeModel
        .find({
          active: true,
          startsAt: { $lte: now },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        })
        .sort({ priority: -1, createdAt: -1 })
        .lean();
      return ok(docs);
    } catch (error) {
      this.logger.error('Failed to find active notices', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find active notices' });
    }
  }

  async findAll(filter: { active?: boolean }, skip: number, limit: number): Promise<Result<{ docs: Notice[]; total: number }, DBError>> {
    try {
      const query: Record<string, any> = {};
      if (filter.active !== undefined) query.active = filter.active;

      const [docs, total] = await Promise.all([
        this.noticeModel.find(query).sort({ priority: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
        this.noticeModel.countDocuments(query),
      ]);
      return ok({ docs, total });
    } catch (error) {
      this.logger.error('Failed to find notices', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find notices' });
    }
  }

  async findByXid(xid: string): Promise<Result<Notice | null, DBError>> {
    try {
      const doc = await this.noticeModel.findOne({ xid }).lean();
      return ok(doc);
    } catch (error) {
      this.logger.error('Failed to find notice by xid', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find notice' });
    }
  }

  async create(data: CreateNoticeData): Promise<Result<Notice, DBError>> {
    try {
      const doc = await this.noticeModel.create(data);
      return ok(doc.toObject());
    } catch (error) {
      this.logger.error('Failed to create notice', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create notice' });
    }
  }

  async update(xid: string, data: Partial<CreateNoticeData>): Promise<Result<Notice | null, DBError>> {
    try {
      const doc = await this.noticeModel.findOneAndUpdate({ xid }, { $set: data }, { new: true }).lean();
      return ok(doc);
    } catch (error) {
      this.logger.error('Failed to update notice', error);
      return err({ code: 'DB_ERROR', message: 'Failed to update notice' });
    }
  }

  async delete(xid: string): Promise<Result<boolean, DBError>> {
    try {
      const result = await this.noticeModel.deleteOne({ xid });
      return ok(result.deletedCount > 0);
    } catch (error) {
      this.logger.error('Failed to delete notice', error);
      return err({ code: 'DB_ERROR', message: 'Failed to delete notice' });
    }
  }

  async findDismissals(userId: Types.ObjectId, noticeIds: Types.ObjectId[]): Promise<Result<NoticeDismissal[], DBError>> {
    try {
      const docs = await this.dismissalModel
        .find({ userId, noticeId: { $in: noticeIds } })
        .lean();
      return ok(docs);
    } catch (error) {
      this.logger.error('Failed to find dismissals', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find dismissals' });
    }
  }

  async upsertDismissal(userId: Types.ObjectId, noticeId: Types.ObjectId): Promise<Result<NoticeDismissal, DBError>> {
    try {
      const doc = await this.dismissalModel.findOneAndUpdate(
        { userId, noticeId },
        { $setOnInsert: { userId, noticeId, dismissedAt: new Date() } },
        { upsert: true, new: true }
      ).lean();
      return ok(doc);
    } catch (error) {
      this.logger.error('Failed to upsert dismissal', error);
      return err({ code: 'DB_ERROR', message: 'Failed to upsert dismissal' });
    }
  }
}
