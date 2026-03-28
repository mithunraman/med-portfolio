import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadObjectOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { backOff } from 'exponential-backoff';
import { extension } from 'mime-types';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
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
    return this.withRetry(async () => {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });

      return getSignedUrl(this.s3, command, { expiresIn });
    });
  }

  /**
   * Generate a presigned URL for downloading a file
   */
  async generatePresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    return this.withRetry(async () => {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      return getSignedUrl(this.s3, command, { expiresIn });
    });
  }

  /**
   * Check if an object exists and get its metadata
   */
  async headObject(bucket: string, key: string): Promise<HeadObjectOutput | null> {
    return this.withRetry(async () => {
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
    });
  }

  /**
   * Delete an object from storage
   */
  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.withRetry(async () => {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      await this.s3.send(command);
    });
  }

  private withRetry<T>(fn: () => Promise<T>): Promise<T> {
    return backOff(fn, {
      numOfAttempts: 3,
      startingDelay: 500,
      timeMultiple: 2,
      jitter: 'full',
      retry: (error) => {
        const retryable = this.isRetryableS3Error(error);
        if (retryable) {
          this.logger.warn('Retryable S3/R2 error, retrying...', error);
        }
        return retryable;
      },
    });
  }

  private isRetryableS3Error(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    // AWS SDK errors expose $metadata.httpStatusCode
    const statusCode =
      (error as any).$metadata?.httpStatusCode ??
      (error as any).statusCode ??
      (error as any).status;
    if (typeof statusCode === 'number') {
      return statusCode === 429 || statusCode >= 500;
    }

    const name = error.name;
    if (
      name === 'ThrottlingException' ||
      name === 'TooManyRequestsException' ||
      name === 'ServiceUnavailable' ||
      name === 'InternalError'
    ) {
      return true;
    }

    const message = error.message.toLowerCase();
    if (message.includes('econnreset') || message.includes('econnrefused')) return true;
    if (message.includes('etimedout') || message.includes('network')) return true;

    return false;
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
