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
import { Types } from 'mongoose';
import { generateXid } from '../common/utils/nanoid.util';
import { isErr } from '../common/utils/result.util';
import { StorageService } from '../storage/storage.service';
import { IMediaRepository, MEDIA_REPOSITORY } from './media.repository.interface';

const PRESIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

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
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(MEDIA_REPOSITORY)
    private readonly mediaRepository: IMediaRepository,
    private readonly storageService: StorageService
  ) {}

  /**
   * Initiate a media upload - creates media record and returns presigned URL
   */
  async initiateUpload(
    userId: string,
    mediaType: MediaType,
    mimeType: string
  ): Promise<InitiateUploadResult> {
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
      xid,
    });

    if (isErr(createResult)) throw new InternalServerErrorException(createResult.error.message);

    // Generate presigned upload URL
    const uploadUrl = await this.storageService.generatePresignedUploadUrl(
      bucket,
      key,
      mimeType,
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
    if (!media.userId.equals(userObjectId))
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

    return {
      mediaId: media._id,
      xid: media.xid,
      sizeBytes: headResult.ContentLength ?? 0,
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
   * Get presigned download URL for media (internal use - for transcription)
   */
  async getPresignedUrl(mediaId: string): Promise<string> {
    const findResult = await this.mediaRepository.findByXidInternal(mediaId);

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
}
