import { MediaStatus } from '@acme/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Result, err, ok } from '../common/utils/result.util';
import {
  CreateMediaData,
  DBError,
  IMediaRepository,
  UpdateMediaStatusData,
} from './media.repository.interface';
import { Media, MediaDocument } from './schemas/media.schema';

@Injectable()
export class MediaRepository implements IMediaRepository {
  private readonly logger = new Logger(MediaRepository.name);

  constructor(
    @InjectModel(Media.name)
    private mediaModel: Model<MediaDocument>
  ) {}

  async create(data: CreateMediaData): Promise<Result<MediaDocument, DBError>> {
    try {
      const createData: Record<string, unknown> = {
        xid: data.xid,
        userId: data.userId,
        bucket: data.bucket,
        key: data.key,
        mediaType: data.mediaType,
        mimeType: data.mimeType,
        status: MediaStatus.PENDING,
      };

      const media = await this.mediaModel.create(createData);
      return ok(media);
    } catch (error) {
      this.logger.error('Failed to create media', error);
      return err({ code: 'DB_ERROR', message: 'Failed to create media' });
    }
  }

  async findByXid(
    xid: string,
    userId: Types.ObjectId
  ): Promise<Result<MediaDocument | null, DBError>> {
    try {
      const media = await this.mediaModel.findOne({ xid, userId });
      return ok(media);
    } catch (error) {
      this.logger.error('Failed to find media by xid', error);
      return err({ code: 'DB_ERROR', message: 'Failed to find media' });
    }
  }

  async findByXidInternal(xid: string): Promise<Result<MediaDocument | null, DBError>> {
    try {
      const media = await this.mediaModel.findOne({ xid });
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
  ): Promise<Result<MediaDocument | null, DBError>> {
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
        .session(session || null);

      return ok(media);
    } catch (error) {
      this.logger.error('Failed to update media status', error);
      return err({ code: 'DB_ERROR', message: 'Failed to update media status' });
    }
  }
}
