import {
  AnalysisRunStatus,
  EXECUTING_RUN_STATUSES,
  TERMINAL_RUN_STATUSES,
} from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CHECKPOINT_PURGE_GRACE_MS,
  STALE_AWAITING_INPUT_RUN_MS,
  STALE_EXECUTING_RUN_MS,
} from '../common/checkpoint-retention.constants';
import { isErr } from '../common/utils/result.util';
import {
  CHECKPOINT_REPOSITORY,
  ICheckpointRepository,
} from '../checkpoints/checkpoint.repository.interface';
import {
  ANALYSIS_RUNS_REPOSITORY,
  IAnalysisRunsRepository,
} from './analysis-runs.repository.interface';

/** The two staleness clocks, paired with the statuses they apply to. */
const STALE_RULES: Array<{ statuses: AnalysisRunStatus[]; windowMs: number }> = [
  {
    // Shared, not a local literal: `findExecutingRun` gates message/artefact
    // mutation on the same set, and a copy here would let the two drift.
    statuses: [...EXECUTING_RUN_STATUSES],
    windowMs: STALE_EXECUTING_RUN_MS,
  },
  {
    statuses: [AnalysisRunStatus.AWAITING_INPUT],
    windowMs: STALE_AWAITING_INPUT_RUN_MS,
  },
];

interface SweepStats {
  expired: number;
  threads: number;
  checkpoints: number;
  writes: number;
}

/**
 * Reaps LangGraph checkpoint data for runs that can never resume.
 *
 * A sweep rather than a job scheduled per run: the predicate is evaluated when
 * the sweeper acts, so a run that has since resumed, been deleted or been
 * restarted is simply not selected. A delayed job would act on a premise that
 * can change after enqueue.
 *
 * ## Why it does not scan `checkpoints`
 *
 * Thread ids are derived (`${conversationId}:${runNumber}`) and `analysis_runs`
 * has no hard deletes, so that collection is a complete, permanent index of
 * every thread ever created. The sweeper queries a small indexed collection and
 * issues targeted deletes; it never scans the large one.
 *
 * Every step is idempotent, so a crash at any point is recovered by the next
 * tick, and concurrent instances are safe (these crons are not leader-elected).
 */
@Injectable()
export class CheckpointSweeperService {
  private readonly logger = new Logger(CheckpointSweeperService.name);
  private processing = false;

  /**
   * A unit of work here is two `deleteMany`s over roughly thirty documents —
   * heavier than an indexed field update, lighter than an object-store round
   * trip. Sized between the message and media sweeps accordingly.
   */
  private static readonly BATCH_SIZE = 25;
  private static readonly MAX_BATCHES_PER_RUN = 100;

  constructor(
    @Inject(ANALYSIS_RUNS_REPOSITORY)
    private readonly analysisRunsRepository: IAnalysisRunsRepository,
    @Inject(CHECKPOINT_REPOSITORY)
    private readonly checkpointRepository: ICheckpointRepository
  ) {}

  @Cron('0 0 * * * *') // Hourly on the minute boundary
  async runSweep(): Promise<void> {
    if (this.processing) {
      this.logger.debug('Checkpoint sweep in progress, skipping');
      return;
    }
    this.processing = true;
    try {
      const stats = await this.sweep();
      this.logger.log(
        `Checkpoint sweep done: ${stats.expired} run(s) expired; ` +
          `${stats.threads} thread(s) purged (${stats.checkpoints} checkpoints, ${stats.writes} writes)`
      );
    } finally {
      this.processing = false;
    }
  }

  /**
   * `now` is injectable so both clocks can be tested without fake timers — the
   * 180-day branch has no other way to be exercised.
   *
   * The two phases select over disjoint status sets — expiry takes non-terminal
   * runs, the purge takes terminal ones — so the ordering changes nothing about
   * what either picks up. It is expiry-first for starvation: expiry is two bulk
   * writes, while the purge runs up to MAX_BATCHES_PER_RUN and holds the
   * `processing` flag that makes the next tick skip. Purging first can therefore
   * defer expiry by a tick, and a run stuck PENDING/RUNNING is holding its
   * conversation's only active-run slot the whole time.
   *
   * A run expired on THIS tick is deliberately not collectable on it: expiry
   * bumps `updatedAt`, and the grace window is measured from there — see the
   * `timestamps` note on `expireStaleRuns` in the repository. That is the
   * intended semantics, not a missed optimisation. Making same-pass collection
   * work means suppressing the bump, which would make every long-abandoned run
   * purgeable the instant it expired and delete the debugging window
   * CHECKPOINT_PURGE_GRACE_MS exists to provide.
   *
   * Never logs thread content — only ids, counts and status.
   */
  async sweep(now: Date = new Date()): Promise<SweepStats> {
    const expired = await this.expireStaleRuns(now);
    const purged = await this.purgeTerminalRuns(now);
    return { expired, ...purged };
  }

  /**
   * Declare dead runs terminal so they become collectable — and, for
   * PENDING/RUNNING, so the conversation's one active-run slot is released.
   *
   * One bulk write per staleness rule. There is no read-then-write loop because
   * there is nothing to read: the status predicate that used to be the per-run
   * optimistic lock does the same job inside the bulk filter, evaluated per
   * document at modification time. Unbatched on purpose — this is a status flip
   * with no external work per row, unlike the purge phase below.
   */
  async expireStaleRuns(now: Date): Promise<number> {
    let expired = 0;

    for (const rule of STALE_RULES) {
      const cutoff = new Date(now.getTime() - rule.windowMs);

      const result = await this.analysisRunsRepository.expireStaleRuns(rule.statuses, cutoff);
      if (isErr(result)) {
        // `continue`, not `break`: the rules are independent clocks, so a
        // failure on one must not skip the other.
        this.logger.error(`expireStaleRuns failed: ${result.error.message}`);
        continue;
      }

      expired += result.value;
    }

    return expired;
  }

  /**
   * Hard-delete checkpoint data for terminal runs past their grace period.
   *
   * All terminal statuses share one grace window and one query. Batches may mix
   * statuses; nothing here branches on one — the purge is keyed by thread id and
   * the marker by `_id`. If grace ever differentiates by status, add a rules
   * array like `STALE_RULES` above and loop it, exactly as phase 1 does.
   */
  async purgeTerminalRuns(now: Date): Promise<Omit<SweepStats, 'expired'>> {
    const cutoff = new Date(now.getTime() - CHECKPOINT_PURGE_GRACE_MS);
    const statuses = [...TERMINAL_RUN_STATUSES];
    let threads = 0;
    let checkpoints = 0;
    let writes = 0;

    for (let batch = 0; batch < CheckpointSweeperService.MAX_BATCHES_PER_RUN; batch++) {
      const found = await this.analysisRunsRepository.findRunsForSweepBatch(
        statuses,
        cutoff,
        CheckpointSweeperService.BATCH_SIZE
      );
      if (isErr(found)) {
        this.logger.error(`findRunsForSweepBatch failed during purge: ${found.error.message}`);
        break;
      }

      const runs = found.value;
      if (runs.length === 0) break;

      const threadIds = runs.map((r) => r.langGraphThreadId);
      const purge = await this.checkpointRepository.purgeThreads(threadIds);
      if (isErr(purge)) {
        // Leaving the loop rather than advancing: the same batch would be
        // returned again next iteration, so continuing would spin. The rows
        // keep their data and are retried on the next tick — the deletes are
        // idempotent and the marker is only written on success, so nothing is
        // lost.
        this.logger.error(
          `purgeThreads failed for ${threadIds.length} thread(s): ${purge.error.message}`
        );
        break;
      }

      // Marker LAST. Marking before deleting would strand the data with its
      // only handle recorded as clean — the one state this sweep cannot
      // recover from.
      const marked = await this.analysisRunsRepository.markCheckpointsPurged(
        runs.map((r) => r._id),
        now
      );
      if (isErr(marked)) {
        this.logger.error(`markCheckpointsPurged failed: ${marked.error.message}`);
        break;
      }

      threads += threadIds.length;
      checkpoints += purge.value.checkpoints;
      writes += purge.value.writes;

      if (runs.length < CheckpointSweeperService.BATCH_SIZE) break;
    }

    return { threads, checkpoints, writes };
  }
}
