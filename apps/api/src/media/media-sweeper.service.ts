import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CRON_OPTIONS, CRON_SCHEDULES } from '../common/cron.constants';
import { retentionCutoff } from '../common/retention.constants';
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

  @Cron(CRON_SCHEDULES.MEDIA_SWEEP, CRON_OPTIONS)
  async runSweep(): Promise<void> {
    if (this.processing) {
      this.logger.debug('Sweep in progress, skipping');
      return;
    }
    this.processing = true;
    try {
      // Marking runs BEFORE sweeping, on purpose: both share this tick, so an
      // object crossing the retention window is marked and deleted in the same
      // pass. Deletion therefore lands at the window plus at most one hour of
      // tick granularity — sweeping first would double that.
      const expired = await this.expireAudio();
      const stats = await this.sweep();
      const deadLetterCount = await this.getDeadLetterCount();
      this.logger.log(
        `Sweep done: ${expired} expired by retention; ${stats.succeeded}/${stats.attempted} succeeded, ${stats.failed} failed across ${stats.batches} batches; dead-letter count: ${deadLetterCount}`
      );
    } finally {
      this.processing = false;
    }
  }

  /**
   * Launch condition **C-3** — audio deleted within the retention window.
   *
   * Only marks; `sweep()` below does the actual object-store delete. A failure
   * here is logged and swallowed rather than aborting the tick: the pending
   * backlog still deserves sweeping, and the marking is idempotent so the next
   * tick retries it.
   *
   * `now` is injectable so tests can place media either side of the cutoff
   * without sleeping.
   */
  async expireAudio(now: Date = new Date()): Promise<number> {
    const result = await this.mediaRepository.expireAudioOlderThan(retentionCutoff(now));
    if (isErr(result)) {
      this.logger.error(`expireAudioOlderThan failed: ${result.error.message}`);
      return 0;
    }
    return result.value;
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
