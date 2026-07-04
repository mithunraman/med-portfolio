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
export const PDP_GOAL_SORT_SENTINEL_ISO = '9999-12-31T00:00:00.000Z';

/**
 * Read-only sentinel VALUE, for value comparisons only (e.g. tests asserting a
 * goal sorted last). Never use this as a Mongoose `@Prop` default or return it
 * from `toSortDate` — `Date` is mutable, so a shared reference is a process-wide
 * footgun. Persistence/derivation paths mint fresh instances via the ISO above.
 */
export const PDP_GOAL_SORT_SENTINEL = new Date(PDP_GOAL_SORT_SENTINEL_ISO);

/**
 * Derive the pagination sort key from a (possibly absent) review date. Returns a
 * FRESH Date for the unscheduled case so callers never share one mutable object.
 */
export const toSortDate = (reviewDate: Date | null | undefined): Date =>
  reviewDate ?? new Date(PDP_GOAL_SORT_SENTINEL_ISO);
