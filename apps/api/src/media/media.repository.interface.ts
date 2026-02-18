import { MediaRefCollection, MediaStatus, MediaType } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { Result } from '../common/utils/result.util';
import type { MediaDocument } from './schemas/media.schema';

export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');

export interface DBError {
  code: string;
  message: string;
}

export interface CreateMediaData {
  xid: string;
  userId: Types.ObjectId;
  bucket: string;
  key: string;
  mediaType: MediaType;
  mimeType: string;
}

export interface UpdateMediaStatusData {
  status: MediaStatus;
  refCollection?: MediaRefCollection;
  refDocumentId?: Types.ObjectId;
  sizeBytes?: number;
}

export interface IMediaRepository {
  create(data: CreateMediaData): Promise<Result<MediaDocument, DBError>>;

  findByXid(xid: string, userId: Types.ObjectId): Promise<Result<MediaDocument | null, DBError>>;

  findByXidInternal(xid: string): Promise<Result<MediaDocument | null, DBError>>;

  updateStatus(
    xid: string,
    data: UpdateMediaStatusData,
    session?: ClientSession
  ): Promise<Result<MediaDocument | null, DBError>>;
}
