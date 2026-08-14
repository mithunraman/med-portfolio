/**
 * Retention windows for LangGraph checkpoint data (`checkpoints`,
 * `checkpoint_writes`).
 *
 * These collections hold a full serialized copy of the graph state at every
 * superstep — the trainee's transcript, the drafted clinical entry, the
 * capability evidence — roughly 30 documents per journey, and nothing deleted
 * them until the sweeper existed.
 *
 * ## Why compile-time constants, not env vars
 *
 * Same reasoning as `UNREDACTED_RETENTION_MS`: a runtime override lets
 * production silently differ from stated policy with nothing in the repo to
 * reveal it. Changing retention is a controller decision and should leave a
 * commit.
 */

/**
 * How long a run's checkpoint data survives after the run goes terminal.
 *
 * A terminal run's thread is already unreachable (see TERMINAL_RUN_STATUSES), so
 * this window buys nothing operationally — it exists so a failed run's graph
 * state is still there when someone goes looking for why it failed.
 */
export const CHECKPOINT_PURGE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a PENDING/RUNNING run may sit untouched before it is presumed dead.
 *
 * This is a **crashed pipeline**, not an abandoned trainee: the outbox stops
 * retrying after `maxAttempts`, and the partial unique index on `analysis_runs`
 * permits one non-terminal run per conversation — so a run stuck here blocks
 * every future analysis on that conversation permanently. Hours, not months.
 */
export const STALE_EXECUTING_RUN_MS = 6 * 60 * 60 * 1000;

/**
 * How long an AWAITING_INPUT run may sit untouched before it is presumed
 * abandoned.
 *
 * A different phenomenon from the above: the run is parked at an interrupt
 * waiting on a trainee who never came back. Long, because the cost of being
 * wrong is destroying a journey someone still intended to finish.
 */
export const STALE_AWAITING_INPUT_RUN_MS = 180 * 24 * 60 * 60 * 1000;
