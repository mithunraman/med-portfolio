export enum PdpGoalStatus {
  /**
   * Written ONLY by the tombstone pipeline, which anonymises goal and action text
   * in the same operation. `anonymizeGoal`, `markDeletedByUserId` and
   * `PdpGoalsService.deleteGoal` all treat this value as proof that content is
   * already gone — account deletion skips these rows entirely. Setting it by any
   * other route leaves clinical content in place and invisible to erasure, which
   * is why it is excluded from the trainee-writable status set.
   */
  DELETED = -999,
  ARCHIVED = -1,
  /**
   * Proposed by analysis, awaiting the trainee's accept/decline at finalise.
   * NOT "an adopted goal the trainee hasn't begun" — such a goal is STARTED.
   * Carries reviewDate: null by construction, so it is never "due"; do not
   * include it in due/active queries.
   */
  PROPOSED = 100,
  STARTED = 200,
  COMPLETED = 300,
}
