/**
 * Every scheduled job in the API, and when it fires.
 *
 * ## Six fields, not five
 *
 * `@nestjs/schedule` uses SECOND MINUTE HOUR DOM MONTH DOW. `'0 0 * * * *'`
 * here is hourly on the minute boundary; the same string in standard five-field
 * cron means something else entirely. An expression copied from crontab.guru or
 * a crontab file needs a seconds field prepended.
 *
 * ## Compile-time, not env
 *
 * Same reasoning as `retention.constants.ts`: a runtime override would let
 * production run on a cadence the repo does not record. Changing a schedule is
 * an operational decision and should leave a commit.
 *
 * ## Why this is complete, and stays complete
 *
 * A string literal passed to `@Cron` is a lint error — see the `apps/api`
 * override in `.eslintrc.cjs`. That is what makes this map an inventory rather
 * than a convention that decays the first time someone adds a job in a hurry.
 * `@Cron` is also the only scheduling decorator in use; there are no
 * `@Interval`/`@Timeout` jobs and nothing registers directly with
 * `SchedulerRegistry`, so this file is the whole picture.
 *
 * ## Why these minutes
 *
 * Staggered 15 minutes apart, and off `:00` — the busiest minute in any
 * infrastructure, and previously when three of these fired simultaneously.
 * Order is deliberate, not just spacing:
 *
 * - **Cheapest first.** MESSAGE_RETENTION is bounded Mongo bulk updates (10k
 *   messages/tick, no network I/O) and clears in seconds.
 * - **Longest last.** MEDIA_SWEEP is the only job doing serial object-store
 *   round-trips (up to 5k awaited deletes), so it can run for minutes. At :50
 *   an overrun collides with nothing.
 * - **Producer before consumer.** ACCOUNT_CLEANUP only *marks* a deleted user's
 *   audio pending-delete; MEDIA_SWEEP performs the actual storage delete. At
 *   05:05 and :50 the erasure completes within the same hour. Reverse them and
 *   it waits a full cycle.
 *
 * Every job's deletion therefore lands later by its offset. That is spent from
 * large budgets — the retention sweeps have ~23h of slack between the 48h
 * constant and the 72h published commitment, and the checkpoint purge has a
 * 7-day grace. No retention constant changes.
 *
 * Staggering separates jobs from each other, NOT replicas from each other. The
 * `processing` guards are per-process and these crons are not leader-elected,
 * so scaling to N instances fires all N at the same offset. That needs a
 * distributed lock, not a different minute.
 */
export const CRON_SCHEDULES = {
  /** Daily at 05:05 — deletion cascade for accounts flagged for erasure. */
  ACCOUNT_CLEANUP: '0 5 5 * * *',
  /** Hourly at :20 — un-redacted content retention sweep (C-2). */
  MESSAGE_RETENTION: '0 20 * * * *',
  /** Hourly at :35 — expires stale runs, purges checkpoint data. */
  CHECKPOINT_SWEEP: '0 35 * * * *',
  /** Hourly at :50 — expires audio (C-3), then deletes objects from storage. */
  MEDIA_SWEEP: '0 50 * * * *',
} as const satisfies Record<string, string>;

/**
 * Derived from the map rather than declared alongside it — a hand-written union
 * would be a second list to keep in sync, which is the problem this file exists
 * to solve.
 */
export type CronName = keyof typeof CRON_SCHEDULES;
