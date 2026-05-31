import { MediaRefCollection, MediaStatus, MediaType } from '@acme/shared';
import { ClientSession, Types } from 'mongoose';
import type { DBError, Result } from '../common/utils/result.util';
import type { Media } from './schemas/media.schema';

export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');


export interface CreateMediaData {
  xid: string;
  userId: Types.ObjectId;
  bucket: string;
  key: string;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
}

export interface UpdateMediaStatusData {
  status: MediaStatus;
  refCollection?: MediaRefCollection;
  refDocumentId?: Types.ObjectId;
  sizeBytes?: number;
}

export interface IMediaRepository {
  create(data: CreateMediaData): Promise<Result<Media, DBError>>;

  findByXid(xid: string, userId: Types.ObjectId): Promise<Result<Media | null, DBError>>;

  findByXidInternal(xid: string): Promise<Result<Media | null, DBError>>;

  updateStatus(
    xid: string,
    data: UpdateMediaStatusData,
    session?: ClientSession
  ): Promise<Result<Media | null, DBError>>;

  findByUser(userId: Types.ObjectId): Promise<Result<Media[], DBError>>;

  // Deletion state machine: ATTACHED → PENDING_DELETE → DELETED.
  // Transitions are guarded by current status in the filter, so invalid
  // transitions are silent no-ops rather than data corruption.

  markPendingDeleteByMessageIds(
    messageIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<Result<number, DBError>>;

  markPendingDeleteByUser(
    userId: string,
    session?: ClientSession
  ): Promise<Result<number, DBError>>;

  findPendingDeleteBatch(limit: number): Promise<Result<Media[], DBError>>;

  countDeadLettered(): Promise<Result<number, DBError>>;

  markDeleted(ids: string[]): Promise<Result<number, DBError>>;

  incrementDeleteAttempts(id: string): Promise<Result<void, DBError>>;
}
