import { MediaStatus, MediaType } from '@acme/shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { generateXid } from '../common/utils/nanoid.util';
import { objectIdsEqual } from '../common/utils/objectid.util';
import { isErr, unwrapVoid } from '../common/utils/result.util';
import { StorageService } from '../storage/storage.service';
import { IMediaRepository, MEDIA_REPOSITORY } from './media.repository.interface';

const PRESIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour
export const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export interface InitiateUploadResult {
  mediaId: string;
  uploadUrl: string;
  expiresIn: number;
}

export interface MediaInfo {
  mediaId: string;
  status: MediaStatus;
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
}

export interface ValidatedMediaUpload {
  mediaId: Types.ObjectId;
  xid: string;
  sizeBytes: number;
  mediaType: MediaType;
  mimeType: string;
  durationMs: number | null;
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(MEDIA_REPOSITORY)
    private readonly mediaRepository: IMediaRepository,
    private readonly storageService: StorageService
  ) {}

  /**
   * Initiate a media upload - creates media record and returns presigned URL.
   *
   * The declared `sizeBytes` is signed into the URL as Content-Length, so S3
   * itself rejects mismatched uploads. The cap is also enforced here.
   */
  async initiateUpload(
    userId: string,
    mediaType: MediaType,
    mimeType: string,
    sizeBytes: number
  ): Promise<InitiateUploadResult> {
    if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException('File exceeds maximum upload size');
    }

    const userObjectId = new Types.ObjectId(userId);
    const bucket = this.storageService.getMediaBucket();

    // Generate xid upfront so we can build the storage key
    const xid = generateXid();
    const key = this.storageService.generateMediaKey(userId, xid, mimeType);

    // Create media record with xid and key in one operation
    const createResult = await this.mediaRepository.create({
      userId: userObjectId,
      bucket,
      key,
      mediaType,
      mimeType,
      sizeBytes,
      xid,
    });

    if (isErr(createResult)) throw new InternalServerErrorException(createResult.error.message);

    // Generate presigned upload URL with signed Content-Length
    const uploadUrl = await this.storageService.generatePresignedUploadUrl(
      bucket,
      key,
      mimeType,
      sizeBytes,
      PRESIGNED_URL_EXPIRY_SECONDS
    );

    return {
      mediaId: xid,
      uploadUrl,
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    };
  }

  /**
   * Validate media upload before attaching to a document.
   * Performs S3 HEAD request and content-type verification.
   * Does NOT update the database - caller is responsible for the DB update.
   *
   * @returns Validated media info including sizeBytes for the DB update
   * @throws NotFoundException, ForbiddenException, ConflictException, BadRequestException
   */
  async validateMediaUpload(userId: string, mediaXid: string): Promise<ValidatedMediaUpload> {
    const userObjectId = new Types.ObjectId(userId);

    // Find the media
    const findResult = await this.mediaRepository.findByXid(mediaXid, userObjectId);

    if (isErr(findResult)) throw new InternalServerErrorException(findResult.error.message);

    const media = findResult.value;
    if (!media) throw new NotFoundException('Media not found');

    // Verify ownership
    if (!objectIdsEqual(media.userId, userObjectId))
      throw new ForbiddenException('Media does not belong to user');

    // Verify status is PENDING
    if (media.status !== MediaStatus.PENDING)
      throw new ConflictException('Media already attached or invalid');

    // Verify file exists in S3
    const headResult = await this.storageService.headObject(media.bucket, media.key);

    if (!headResult) throw new BadRequestException('File not uploaded to storage');

    // Verify uploaded file matches declared Content-Type
    if (headResult.ContentType !== media.mimeType) {
      throw new BadRequestException(
        `File type mismatch: expected ${media.mimeType}, got ${headResult.ContentType}`
      );
    }

    // Defense in depth: even though S3 enforces ContentLength via the signed URL,
    // re-check the actual size in case anything ever bypasses that path. If the
    // HEAD response is missing ContentLength entirely, refuse the attach rather
    // than persist a 0-byte placeholder or silently skip the cap check.
    if (typeof headResult.ContentLength !== 'number') {
      throw new InternalServerErrorException('Unable to determine uploaded file size');
    }
    const actualSizeBytes = headResult.ContentLength;
    if (actualSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException('File exceeds maximum upload size');
    }

    return {
      mediaId: media._id,
      xid: media.xid,
      sizeBytes: actualSizeBytes,
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      durationMs: media.durationMs,
    };
  }

  /**
   * Get media info including download URL
   */
  async getMediaInfo(userId: string, mediaId: string): Promise<MediaInfo> {
    const userObjectId = new Types.ObjectId(userId);

    const findResult = await this.mediaRepository.findByXid(mediaId, userObjectId);

    if (isErr(findResult)) throw new InternalServerErrorException(findResult.error.message);

    const media = findResult.value;

    if (!media) throw new NotFoundException('Media not found');

    // Generate download URL only if file is attached
    let downloadUrl: string | null = null;
    if (media.status === MediaStatus.ATTACHED) {
      downloadUrl = await this.storageService.generatePresignedDownloadUrl(
        media.bucket,
        media.key,
        PRESIGNED_URL_EXPIRY_SECONDS
      );
    }

    return {
      mediaId: media.xid,
      status: media.status,
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      downloadUrl,
    };
  }

  /**
   * Get presigned download URL for media. Scoped by userId — the URL grants
   * unauthenticated access to the underlying object, so ownership is enforced
   * here rather than trusted from the caller.
   */
  async getPresignedUrl(userId: string, mediaId: string): Promise<string> {
    const userObjectId = new Types.ObjectId(userId);
    const findResult = await this.mediaRepository.findByXid(mediaId, userObjectId);

    if (isErr(findResult)) throw new InternalServerErrorException(findResult.error.message);

    const media = findResult.value;

    if (!media) throw new NotFoundException('Media not found');

    return this.storageService.generatePresignedDownloadUrl(
      media.bucket,
      media.key,
      PRESIGNED_URL_EXPIRY_SECONDS
    );
  }

  /**
   * Find media by xid (for use in message processing)
   */
  async findByXid(userId: string, mediaId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const findResult = await this.mediaRepository.findByXid(mediaId, userObjectId);

    if (isErr(findResult)) throw new InternalServerErrorException(findResult.error.message);

    return findResult.value;
  }

  /**
   * Cascade entry point: flip media attached to the given messages into
   * PENDING_DELETE for async S3 cleanup by the sweeper.
   */
  async markPendingDeleteByMessageIds(
    messageIds: Types.ObjectId[],
    session?: ClientSession
  ): Promise<void> {
    unwrapVoid(await this.mediaRepository.markPendingDeleteByMessageIds(messageIds, session));
  }
}
