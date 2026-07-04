import {
  PDP_GOAL_SORT_SENTINEL,
  PDP_GOAL_SORT_SENTINEL_ISO,
  toSortDate,
} from '../pdp-goal.constants';

describe('toSortDate', () => {
  it('returns the given reviewDate when present', () => {
    const reviewDate = new Date('2026-06-15T00:00:00.000Z');
    expect(toSortDate(reviewDate)).toBe(reviewDate);
  });

  it('returns the sentinel VALUE for an absent reviewDate', () => {
    expect(toSortDate(null).toISOString()).toBe(PDP_GOAL_SORT_SENTINEL_ISO);
    expect(toSortDate(undefined).toISOString()).toBe(PDP_GOAL_SORT_SENTINEL.toISOString());
  });

  it('returns a FRESH instance each call — never a shared mutable Date', () => {
    const a = toSortDate(null);
    const b = toSortDate(null);
    // Same value, distinct objects: mutating one must not affect the other or
    // the module-level sentinel (the aliasing footgun this guards against).
    expect(a).not.toBe(b);
    expect(a).not.toBe(PDP_GOAL_SORT_SENTINEL);

    a.setFullYear(2000);
    expect(b.toISOString()).toBe(PDP_GOAL_SORT_SENTINEL_ISO);
    expect(PDP_GOAL_SORT_SENTINEL.toISOString()).toBe(PDP_GOAL_SORT_SENTINEL_ISO);
  });
});
