import { UNREDACTED_RETENTION_MS, retentionCutoff } from '../retention.constants';

describe('retention constants', () => {
  it('is 48 hours', () => {
    // Guards the value the whole retention programme is built on. The published
    // Privacy Policy commitment is deliberately looser (72h); see the constant's
    // doc comment before changing either number.
    expect(UNREDACTED_RETENTION_MS).toBe(48 * 60 * 60 * 1000);
  });

  it('places the cutoff exactly one window behind the given instant', () => {
    const now = new Date('2026-08-06T12:00:00.000Z');
    expect(retentionCutoff(now).toISOString()).toBe('2026-08-04T12:00:00.000Z');
  });

  it('defaults to the current instant', () => {
    const before = Date.now();
    const cutoff = retentionCutoff().getTime();
    const after = Date.now();

    expect(cutoff).toBeGreaterThanOrEqual(before - UNREDACTED_RETENTION_MS);
    expect(cutoff).toBeLessThanOrEqual(after - UNREDACTED_RETENTION_MS);
  });
});
