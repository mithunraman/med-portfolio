/**
 * How long un-redacted personal data may persist before the retention sweeps
 * remove it. Governs BOTH `rawContent`/`redactedContent` on messages (C-2) and
 * audio objects in object storage (C-3), so the two can never drift apart.
 *
 * Deliberately a compile-time constant, not an env var. This value backs a
 * published Privacy Policy commitment; a runtime override would let production
 * silently differ from what users are told, with nothing in the repo to reveal
 * it. Changing retention is a controller decision and should leave a commit.
 *
 * ## 48 here, 72 in the Privacy Policy — on purpose
 *
 * Sweeps run hourly, so real deletion lands at 48h + up to one tick ≈ 49h. The
 * published commitment is **72 hours**, deliberately looser, to absorb sweep
 * granularity, missed ticks, restarts, dead-letter retries and batch backlog.
 * Do NOT raise this constant to match the published figure: the headroom is the
 * point, and narrowing it turns an operational hiccup into a broken promise.
 *
 * See DPIA §6.4/§6.5 and launch conditions C-2 / C-3 / C-4.
 */
export const UNREDACTED_RETENTION_MS = 48 * 60 * 60 * 1000;

/**
 * Anything written before this instant is past its retention window.
 *
 * `now` is injectable so both sweeps are deterministically testable without
 * fake timers — a retention test that has to sleep is a retention test nobody
 * runs.
 */
export function retentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - UNREDACTED_RETENTION_MS);
}
