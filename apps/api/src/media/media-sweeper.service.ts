import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isErr } from '../common/utils/result.util';
import { StorageService } from '../storage/storage.service';
import { IMediaRepository, MEDIA_REPOSITORY } from './media.repository.interface';

const BATCH_SIZE = 10;
const MAX_BATCHES_PER_RUN = 500;

interface SweepStats {
  batches: number;
  attempted: number;
  succeeded: number;
  failed: number;
}

@Injectable()
export class MediaSweeperService {
  private readonly logger = new Logger(MediaSweeperService.name);
  private processing = false;

  constructor(
    @Inject(MEDIA_REPOSITORY) private readonly mediaRepository: IMediaRepository,
    private readonly storageService: StorageService
  ) {}

  @Cron('0 0 * * * *') // Hourly on the minute boundary
  async runSweep(): Promise<void> {
    if (this.processing) {
      this.logger.debug('Sweep in progress, skipping');
      return;
    }
    this.processing = true;
    try {
      const stats = await this.sweep();
      const deadLetterCount = await this.getDeadLetterCount();
      this.logger.log(
        `Sweep done: ${stats.succeeded}/${stats.attempted} succeeded, ${stats.failed} failed across ${stats.batches} batches; dead-letter count: ${deadLetterCount}`
      );
    } finally {
      this.processing = false;
    }
  }

  async sweep(): Promise<SweepStats> {
    let batches = 0;
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;

    while (batches < MAX_BATCHES_PER_RUN) {
      const result = await this.mediaRepository.findPendingDeleteBatch(BATCH_SIZE);
      if (isErr(result)) {
        this.logger.error(`findPendingDeleteBatch failed: ${result.error.message}`);
        break;
      }
      const batch = result.value;
      if (batch.length === 0) break;
      batches++;

      const successfulIds: string[] = [];
      for (const item of batch) {
        attempted++;
        try {
          await this.storageService.deleteObject(item.bucket, item.key);
          successfulIds.push(item._id.toString());
          succeeded++;
        } catch (error) {
          failed++;
          this.logger.warn(`S3 delete failed id=${item._id.toString()} key=${item.key}: ${error}`);
          const incResult = await this.mediaRepository.incrementDeleteAttempts(item._id.toString());
          if (isErr(incResult)) {
            this.logger.error(
              `incrementDeleteAttempts failed id=${item._id.toString()}: ${incResult.error.message}`
            );
          }
        }
      }

      if (successfulIds.length > 0) {
        const markResult = await this.mediaRepository.markDeleted(successfulIds);
        if (isErr(markResult)) {
          this.logger.error(
            `markDeleted failed for ${successfulIds.length} ids: ${markResult.error.message}`
          );
          // S3 deletes are idempotent; next run reprocesses these rows.
          break;
        }
      }

      if (batch.length < BATCH_SIZE) break;
    }

    return { batches, attempted, succeeded, failed };
  }

  private async getDeadLetterCount(): Promise<number | 'unknown'> {
    const result = await this.mediaRepository.countDeadLettered();
    if (isErr(result)) {
      this.logger.error(`countDeadLettered failed: ${result.error.message}`);
      return 'unknown';
    }
    return result.value;
  }
}
