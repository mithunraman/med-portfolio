export enum AnalysisRunStatus {
  DELETED = -999,
  PENDING = 100,
  RUNNING = 200,
  AWAITING_INPUT = 300,
  COMPLETED = 400,
  FAILED = 500,
  /**
   * Reaped by the checkpoint sweeper: either the pipeline crashed and left the
   * run wedged, or the trainee abandoned it mid-question long enough that its
   * graph state was collected.
   *
   * Distinct from FAILED so "the trainee walked away" and "the pipeline broke"
   * stay separable in logs and dashboards — the *client* experience of the two
   * is identical, which RESTARTABLE_RUN_STATUSES below encodes.
   */
  EXPIRED = 600,
}

/**
 * Statuses from which a run can never resume.
 *
 * A terminal run's LangGraph thread is unreachable forever: thread ids are
 * derived as `${conversationId}:${runNumber}` and a re-analysis always mints a
 * fresh one, so nothing can read that thread again. That is what makes it safe
 * for the sweeper to purge its checkpoint data.
 */
export const TERMINAL_RUN_STATUSES: ReadonlySet<AnalysisRunStatus> = new Set([
  AnalysisRunStatus.COMPLETED,
  AnalysisRunStatus.FAILED,
  AnalysisRunStatus.EXPIRED,
  AnalysisRunStatus.DELETED,
]);

/**
 * Statuses in which a run still occupies its conversation's single active slot.
 *
 * ## Why this is stated positively rather than derived as "not terminal"
 *
 * The same invariant is enforced in two places — the application guard
 * (`findActiveRun`) and the partial unique index on `analysis_runs` — and they
 * must name the *same* set or the guard rejects starts the database would have
 * allowed. Expressing one as the complement of the other makes that agreement an
 * arithmetic coincidence that no test observes; adding a status to the enum
 * silently desynced them once already.
 *
 * It also fails in the safer direction: a status added later is treated as
 * inactive (the index remains the backstop) rather than as active, which would
 * block every future analysis on that conversation with no way for the trainee
 * to recover.
 *
 * Distinct from "a worker is attached to this run" — that is
 * EXECUTING_RUN_STATUSES below, which deliberately excludes AWAITING_INPUT.
 */
export const NON_TERMINAL_RUN_STATUSES: ReadonlySet<AnalysisRunStatus> = new Set([
  AnalysisRunStatus.PENDING,
  AnalysisRunStatus.RUNNING,
  AnalysisRunStatus.AWAITING_INPUT,
]);

/**
 * Statuses in which a worker is processing the run, or is about to.
 *
 * AWAITING_INPUT is excluded deliberately: it is parked at an interrupt waiting
 * on the trainee, with no worker attached, so it is safe to mutate or tombstone
 * underneath. That is what makes this a different set from
 * NON_TERMINAL_RUN_STATUSES rather than a synonym for it.
 *
 * ## Why it is shared rather than local to one module
 *
 * Two consumers must name the same set, and both fail silently if they drift:
 *
 * - `findExecutingRun` — the guard that blocks editing/deleting a message or
 *   artefact while a worker holds the conversation. Miss a status and the
 *   trainee edits the transcript out from under a live run.
 * - The sweeper's six-hour staleness clock (STALE_EXECUTING_RUN_MS). Miss a
 *   status and a crashed run never expires, holding its conversation's single
 *   active-run slot forever.
 *
 * PENDING belongs here even though no worker has picked it up yet: dispatch is
 * imminent, and the outbox can dead-letter it, which is exactly the wedge the
 * staleness clock exists to clear.
 */
export const EXECUTING_RUN_STATUSES: ReadonlySet<AnalysisRunStatus> = new Set([
  AnalysisRunStatus.PENDING,
  AnalysisRunStatus.RUNNING,
]);

/**
 * Terminal statuses that leave the conversation open to a fresh analysis.
 *
 * Named rather than tested inline (`status !== FAILED`) because the concept is
 * "the trainee can start over", not "one specific enum value" — an implicit
 * check silently excludes every status added later, which is exactly how a run
 * ends up in a phase that offers a composer but denies the start action.
 *
 * COMPLETED is absent on purpose: it produced an artefact and the conversation
 * is done, not restartable.
 */
export const RESTARTABLE_RUN_STATUSES: ReadonlySet<AnalysisRunStatus> = new Set([
  AnalysisRunStatus.FAILED,
  AnalysisRunStatus.EXPIRED,
]);
