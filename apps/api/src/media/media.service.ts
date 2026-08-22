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

// A presigned URL is a bearer credential: whoever holds the string can use it,
// with no auth check, no ownership check and no way to revoke. The TTL is the
// only access control there is, so each purpose gets a window sized to the work
// it must survive rather than all three sharing the longest one.

// Grants PUT to one key, not read — no confidentiality exposure. Sized for a
// 20 MB upload on poor mobile data.
const UPLOAD_URL_EXPIRY_SECONDS = 900;
// Minted during message-list enrichment, not when the user taps play, so it has
// to cover a browsing session rather than a single fetch.
const PLAYBACK_URL_EXPIRY_SECONDS = 1800;
// The sensitive one: handed to the transcription provider, so it leaves our
// trust boundary and unlocks un-redacted audio (redaction runs on the
// transcript, so nothing has de-identified this object yet). Only has to cover
// the provider's single fetch after job submission.
const TRANSCRIPTION_URL_EXPIRY_SECONDS = 900;

export const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

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
      UPLOAD_URL_EXPIRY_SECONDS
    );

    return {
      mediaId: xid,
      uploadUrl,
      expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
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
        PLAYBACK_URL_EXPIRY_SECONDS
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
   * Presigned download URL for in-app playback of the user's own audio.
   */
  async getPlaybackUrl(userId: string, mediaId: string): Promise<string> {
    return this.presignDownload(userId, mediaId, PLAYBACK_URL_EXPIRY_SECONDS);
  }

  /**
   * Presigned download URL for the transcription provider's fetch. If
   * transcription starts failing to retrieve audio, TRANSCRIPTION_URL_EXPIRY_SECONDS
   * is the first thing to check.
   */
  async getTranscriptionUrl(userId: string, mediaId: string): Promise<string> {
    return this.presignDownload(userId, mediaId, TRANSCRIPTION_URL_EXPIRY_SECONDS);
  }

  /**
   * Scoped by userId — the URL grants unauthenticated access to the underlying
   * object, so ownership is enforced here rather than trusted from the caller.
   *
   * Private, with purpose-named wrappers above, so the expiry is chosen by what
   * the URL is *for* rather than passed in at the call site where it could be
   * given the wrong window with nothing to catch it.
   */
  private async presignDownload(
    userId: string,
    mediaId: string,
    expiresInSeconds: number
  ): Promise<string> {
    const userObjectId = new Types.ObjectId(userId);
    const findResult = await this.mediaRepository.findByXid(mediaId, userObjectId);

    if (isErr(findResult)) throw new InternalServerErrorException(findResult.error.message);

    const media = findResult.value;

    if (!media) throw new NotFoundException('Media not found');

    return this.storageService.generatePresignedDownloadUrl(
      media.bucket,
      media.key,
      expiresInSeconds
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
    userId: Types.ObjectId,
    session?: ClientSession
  ): Promise<void> {
    unwrapVoid(
      await this.mediaRepository.markPendingDeleteByMessageIds(messageIds, userId, session)
    );
  }
}
