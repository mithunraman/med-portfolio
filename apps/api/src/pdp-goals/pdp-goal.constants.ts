/**
 * Internal, non-null sort key for keyset pagination over PDP goals.
 *
 * `reviewDate` is nullable (a goal may have no scheduled review). Sorting/seeking
 * on a nullable field breaks keyset pagination — nulls sort first and can't be
 * represented in a date-based cursor. We derive a never-null `sortDate` on every
 * write as `reviewDate ?? PDP_GOAL_SORT_SENTINEL`, so unscheduled goals sort last
 * and the cursor always serializes. This sentinel is a persistence-layer detail:
 * it is never surfaced in DTOs — `reviewDate` remains honestly `null` on read.
 */
export const PDP_GOAL_SORT_SENTINEL = new Date('9999-12-31T00:00:00.000Z');

/** Derive the pagination sort key from a (possibly absent) review date. */
export const toSortDate = (reviewDate: Date | null | undefined): Date =>
  reviewDate ?? PDP_GOAL_SORT_SENTINEL;
