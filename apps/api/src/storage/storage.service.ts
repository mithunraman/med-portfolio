import {
  GetObjectCommand,
  HeadObjectCommand,
  HeadObjectOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extension } from 'mime-types';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly mediaBucket: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('app.storage.endpoint');
    const region = this.configService.get<string>('app.storage.region');
    const accessKeyId = this.configService.get<string>('app.storage.accessKeyId');
    const secretAccessKey = this.configService.get<string>('app.storage.secretAccessKey');

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Missing storage credentials: accessKeyId or secretAccessKey');
    }

    this.s3 = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for R2 and MinIO
    });

    const mediaBucket = this.configService.get<string>('app.storage.mediaBucket');
    if (!mediaBucket) throw new Error('Missing config: app.storage.mediaBucket');
    this.mediaBucket = mediaBucket;
  }

  /**
   * Generate a presigned URL for uploading a file
   */
  async generatePresignedUploadUrl(
    bucket: string,
    key: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.s3, command, { expiresIn });
  }

  /**
   * Generate a presigned URL for downloading a file
   */
  async generatePresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, command, { expiresIn });
  }

  /**
   * Check if an object exists and get its metadata
   */
  async headObject(bucket: string, key: string): Promise<HeadObjectOutput | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      return await this.s3.send(command);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Generate a media key for storage
   * Format: media/{userId}/{mediaId}.{extension}
   */
  generateMediaKey(userId: string, mediaId: string, mimeType: string): string {
    const ext = extension(mimeType) || 'bin';
    return `media/${userId}/${mediaId}.${ext}`;
  }

  /**
   * Get the media bucket name
   */
  getMediaBucket(): string {
    return this.mediaBucket;
  }
}
