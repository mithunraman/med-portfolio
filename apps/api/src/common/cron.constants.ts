/**
 * Every scheduled job in the API, and when it fires.
 *
 * ## Six fields, not five
 *
 * `@nestjs/schedule` uses SECOND MINUTE HOUR DOM MONTH DOW, and
 * `cron.constants.spec.ts` asserts six fields throughout. Not because five-field
 * strings are misread — `cron` detects the count and reads them as crontab
 * would. The hazard is a six-field expression that *loses* a field: hourly
 * `'0 0 * * * *'` minus one is `'0 0 * * *'` — midnight daily, valid, 24× rarer.
 *
 * ## Europe/London, explicitly
 *
 * `CRON_OPTIONS` pins the timezone. Unpinned, `cron` uses process-local time, so
 * ACCOUNT_CLEANUP's wall-clock hour would be whatever `TZ` the container carries
 * — and nothing in this repo sets one. The compliance record states a time of
 * day for erasure, so it must be a property of the code, not the host. London
 * rather than UTC because 05:05 was chosen for being outside UK working hours,
 * and UTC would drift it to 06:05 local under BST. DST costs nothing: 05:05
 * exists on both transition days. The hourly jobs are pinned for uniformity.
 *
 * ## Compile-time, not env
 *
 * Same reasoning as `retention.constants.ts`: a runtime override would let
 * production run on a cadence the repo does not record.
 *
 * ## Why this is complete, and stays complete
 *
 * A string literal passed to `@Cron` is a lint error (`apps/api` override in
 * `.eslintrc.cjs`), which is what makes this an inventory rather than a
 * convention. `@Cron` is also the only scheduling decorator in use — no
 * `@Interval`/`@Timeout`, nothing on `SchedulerRegistry`.
 *
 * ## Why these minutes
 *
 * Staggered 15 minutes apart and off `:00`, previously when three of these fired
 * at once. The order is deliberate:
 *
 * - **Cheapest first.** MESSAGE_RETENTION is bounded Mongo bulk updates (10k
 *   messages/tick) and clears in seconds.
 * - **Longest last.** MEDIA_SWEEP does serial object-store round-trips (up to 5k
 *   awaited deletes), so it can run for minutes; :50 gives it 30 minutes of
 *   run-on against 15 for everything else. Except at 04:50, which runs into
 *   ACCOUNT_CLEANUP — tolerated, not prevented, since the `processing` guards
 *   are per-service and nothing here excludes anything else anyway.
 * - **Producer before consumer.** ACCOUNT_CLEANUP only *marks* a deleted user's
 *   audio pending-delete; MEDIA_SWEEP does the storage delete. At 05:05 and :50
 *   erasure completes within the hour; reversed, it waits a full cycle.
 *
 * Each offset delays that job's deletion, spent from large budgets: ~23h of
 * slack between the 48h retention constant and the 72h published commitment, and
 * a 7-day checkpoint grace. No retention constant changes.
 *
 * Staggering separates jobs from each other, NOT replicas from each other. These
 * crons are not leader-elected and the `processing` guards are per-process, so N
 * instances all fire at the same offset. That needs a distributed lock.
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

/** The timezone the expressions above are written in. */
export const CRON_TIMEZONE = 'Europe/London';

/**
 * Second argument to every `@Cron`. Shared rather than per-decorator so a job
 * cannot be added on a different clock to the rest.
 */
export const CRON_OPTIONS = { timeZone: CRON_TIMEZONE } as const;

/**
 * Derived, not declared alongside the map — a hand-written union would be a
 * second list to keep in sync, which is the problem this file exists to solve.
 */
export type CronName = keyof typeof CRON_SCHEDULES;
