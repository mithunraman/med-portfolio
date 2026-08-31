import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CRON_OPTIONS, CRON_SCHEDULES } from '../common/cron.constants';
import { retentionCutoff } from '../common/retention.constants';
import { isErr } from '../common/utils/result.util';
import {
  CONVERSATIONS_REPOSITORY,
  IConversationsRepository,
} from './conversations.repository.interface';

/**
 * Launch condition **C-2** — `rawContent` deleted within the retention window.
 *
 * `rawContent` is the trainee's original input before anything touches it: every
 * patient name, NHS number and address, as typed or as transcribed. Until this
 * service existed it was kept indefinitely, so the exposed population grew in
 * direct proportion to how well the product did. DPIA §6.5 now cites bounded
 * retention as part of the lawful-basis argument, not merely as good practice.
 *
 * `redactedContent` goes with it. On the edit path it is regex-only
 * (`redactStandalone`, because that write runs inside a Mongo transaction where
 * a network call has no place), so it is a weaker artefact than `content`.
 *
 * **`content` is never touched.** It is the redacted, cleaned display text — the
 * only version the trainee ever saw — and keeping it is what satisfies DEC-11
 * ("trainees might want to revisit what they told the AI"). What this removes is
 * the un-redacted copy they were never shown.
 *
 * ## Why every status is swept
 *
 * Including in-flight messages and DELETED tombstones. Scoping by status would
 * let a message stuck in TRANSCRIBING retain raw PHI indefinitely, which is
 * precisely the failure this condition exists to prevent. The consequence is
 * accepted: a message stuck past the window that later retries fails with "No
 * raw content to process", which is correct — the raw input is genuinely gone.
 */
@Injectable()
export class MessageRetentionService {
  private readonly logger = new Logger(MessageRetentionService.name);
  private processing = false;

  /**
   * Bounded per tick. The batch is larger than the media sweeper's (10) because
   * each unit of work here is a single indexed field update rather than a
   * network round-trip to object storage.
   */
  private static readonly BATCH_SIZE = 100;
  private static readonly MAX_BATCHES_PER_RUN = 100;

  constructor(
    @Inject(CONVERSATIONS_REPOSITORY)
    private readonly conversationsRepository: IConversationsRepository
  ) {}

  @Cron(CRON_SCHEDULES.MESSAGE_RETENTION, CRON_OPTIONS)
  async runSweep(): Promise<void> {
    if (this.processing) {
      this.logger.debug('Retention sweep in progress, skipping');
      return;
    }
    this.processing = true;
    try {
      const scrubbed = await this.sweep();
      this.logger.log(`Message retention sweep done: ${scrubbed} message(s) scrubbed`);
    } finally {
      this.processing = false;
    }
  }

  /**
   * `now` is injectable so tests can place messages either side of the cutoff
   * without sleeping. Returns the number of messages scrubbed.
   *
   * Never logs content — only ids, counts and status. Every line here is
   * exported to Grafana, whose retention is the only erasure mechanism for
   * anything that lands there.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    const cutoff = retentionCutoff(now);
    let scrubbed = 0;

    for (let batch = 0; batch < MessageRetentionService.MAX_BATCHES_PER_RUN; batch++) {
      const found = await this.conversationsRepository.findExpiredRawContentBatchAcrossAllUsers(
        cutoff,
        MessageRetentionService.BATCH_SIZE
      );
      if (isErr(found)) {
        this.logger.error(`findExpiredRawContentBatch failed: ${found.error.message}`);
        break;
      }

      const ids = found.value;
      if (ids.length === 0) break;

      const result = await this.conversationsRepository.scrubRawContentAcrossAllUsers(ids);
      if (isErr(result)) {
        // Leaving the loop rather than advancing: the same batch would be
        // returned again next iteration, so continuing would spin. The rows keep
        // their content and are retried on the next tick — the sweep is
        // idempotent and the predicate is the data itself, so nothing is lost.
        this.logger.error(`scrubRawContent failed for ${ids.length} ids: ${result.error.message}`);
        break;
      }
      scrubbed += result.value;

      if (ids.length < MessageRetentionService.BATCH_SIZE) break;
    }

    return scrubbed;
  }
}
