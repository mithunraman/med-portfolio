import { MediaRefCollection, MediaStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { DBError, Result, err, ok } from '../common/utils/result.util';
import {
  CreateMediaData,
  IMediaRepository,
  UpdateMediaStatusData,
} from './media.repository.interface';
import { Media, MediaDocument } from './schemas/media.schema';

// Sweep policy: a row that fails 24 hourly attempts is considered dead-lettered
// and excluded from future sweeps. countDeadLettered() exposes the backlog for ops.
const DEAD_LETTER_THRESHOLD = 24;

@Injectable()
export class MediaRepository implements IMediaRepository {
  private readonly logger = new Logger(MediaRepository.name);

  constructor(
    @InjectModel(Media.name)
    private mediaModel: Model<MediaDocument>
  ) {}

  async create(data: CreateMediaData): Promise<Result<Media, DBError>> {
    try {
      const createData: Record<string, unknown> = {
        xid: data.xid,
        userId: data.userId,
        bucket: data.bucket,
        key: data.key,
        mediaType: data.mediaType,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        status: MediaStatus.PENDING,
      };

      const media = await this.mediaModel.create(createData);
      return ok(media);
    } catch (error) {
      this.logger.error('Failed to create media', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create media' });
    }
  }

  async findByXid(xid: string, userId: Types.ObjectId): Promise<Result<Media | null, DBError>> {
    try {
      const media = await this.mediaModel.findOne({ xid, userId }).lean();
      return ok(media);
    } catch (error) {
      this.logger.error('Failed to find media by xid', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find media' });
    }
  }

  async findByXidInternal(xid: string): Promise<Result<Media | null, DBError>> {
    try {
      const media = await this.mediaModel.findOne({ xid }).lean();
      return ok(media);
    } catch (error) {
      this.logger.error('Failed to find media by xid (internal)', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find media' });
    }
  }

  async updateStatus(
    xid: string,
    data: UpdateMediaStatusData,
    session?: ClientSession
  ): Promise<Result<Media | null, DBError>> {
    try {
      const updateData: Record<string, unknown> = {
        status: data.status,
      };

      if (data.refCollection !== undefined) {
        updateData.refCollection = data.refCollection;
      }

      if (data.refDocumentId !== undefined) {
        updateData.refDocumentId = data.refDocumentId;
      }

      if (data.sizeBytes !== undefined) {
        updateData.sizeBytes = data.sizeBytes;
      }

      const media = await this.mediaModel
        .findOneAndUpdate({ xid }, { $set: updateData }, { new: true })
        .lean()
        .session(session || null);

      return ok(media);
    } catch (error) {
      this.logger.error('Failed to update media status', error);
      return err({ code: 'DB_ERROR', message: 'Failed to update media status' });
    }
  }

  async findByUser(userId: Types.ObjectId): Promise<Result<Media[], DBError>> {
    try {
      const media = await this.mediaModel.find({ userId }).select('bucket key').lean();
      return ok(media);
    } catch (error) {
      this.logger.error('Failed to find media by user', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find media by user' });
    }
  }

  async markPendingDeleteByMessageIds(
    messageIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    try {
      if (messageIds.length === 0) return ok(0);
      const result = await this.mediaModel.updateMany(
        {
          refDocumentId: { $in: messageIds },
          refCollection: MediaRefCollection.MESSAGES,
          status: MediaStatus.ATTACHED,
        },
        { $set: { status: MediaStatus.PENDING_DELETE, pendingDeleteAt: new Date() } },
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark media pending delete by message ids', error);
      return err({ code: 'DB_ERROR', message: 'Failed to mark media pending delete' });
    }
  }

  async markPendingDeleteByUser(
    userId: string,
    session?: ClientSession
  ): Promise<Result<number, DBError>> {
    try {
      const result = await this.mediaModel.updateMany(
        {
          userId: new Types.ObjectId(userId),
          status: { $in: [MediaStatus.ATTACHED, MediaStatus.PENDING] },
        },
        { $set: { status: MediaStatus.PENDING_DELETE, pendingDeleteAt: new Date() } },
        { session }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark media pending delete by user', error);
      return err({ code: 'DB_ERROR', message: 'Failed to mark media pending delete' });
    }
  }

  async findPendingDeleteBatch(limit: number): Promise<Result<Media[], DBError>> {
    try {
      const media = await this.mediaModel
        .find({
          status: MediaStatus.PENDING_DELETE,
          deleteAttempts: { $lt: DEAD_LETTER_THRESHOLD },
        })
        .limit(limit)
        .lean();
      return ok(media);
    } catch (error) {
      this.logger.error('Failed to find pending-delete batch', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find pending-delete batch' });
    }
  }

  async countDeadLettered(): Promise<Result<number, DBError>> {
    try {
      const count = await this.mediaModel.countDocuments({
        status: MediaStatus.PENDING_DELETE,
        deleteAttempts: { $gte: DEAD_LETTER_THRESHOLD },
      });
      return ok(count);
    } catch (error) {
      this.logger.error('Failed to count dead-lettered media', error);
      return err({ code: 'DB_ERROR', message: 'Failed to count dead-lettered media' });
    }
  }

  async markDeleted(ids: string[]): Promise<Result<number, DBError>> {
    try {
      if (ids.length === 0) return ok(0);
      const objectIds = ids.map((id) => new Types.ObjectId(id));
      const result = await this.mediaModel.updateMany(
        { _id: { $in: objectIds }, status: MediaStatus.PENDING_DELETE },
        { $set: { status: MediaStatus.DELETED } }
      );
      return ok(result.modifiedCount);
    } catch (error) {
      this.logger.error('Failed to mark media deleted', error);
      return err({ code: 'DB_ERROR', message: 'Failed to mark media deleted' });
    }
  }

  async incrementDeleteAttempts(id: string): Promise<Result<void, DBError>> {
    try {
      await this.mediaModel.updateOne(
        { _id: new Types.ObjectId(id), status: MediaStatus.PENDING_DELETE },
        { $inc: { deleteAttempts: 1 } }
      );
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to increment delete attempts', error);
      return err({ code: 'DB_ERROR', message: 'Failed to increment delete attempts' });
    }
  }
}
