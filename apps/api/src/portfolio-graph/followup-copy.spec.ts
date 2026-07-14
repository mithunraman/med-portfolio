import {
  FOLLOWUP_LINES,
  pickFollowupLine,
  resolveFollowupTier,
  type FollowupTier,
} from './followup-copy';

describe('resolveFollowupTier', () => {
  const base = { askedRound: 1, maxFollowupRounds: 10, tierFloor: 1 };

  it('buckets readinessScore into tiers 1–3 (non-terminal)', () => {
    expect(resolveFollowupTier({ ...base, readinessScore: 0 })).toBe(1);
    expect(resolveFollowupTier({ ...base, readinessScore: 2.9 })).toBe(1);
    expect(resolveFollowupTier({ ...base, readinessScore: 3 })).toBe(2);
    expect(resolveFollowupTier({ ...base, readinessScore: 5.4 })).toBe(2);
    expect(resolveFollowupTier({ ...base, readinessScore: 5.5 })).toBe(3);
    expect(resolveFollowupTier({ ...base, readinessScore: 7.9 })).toBe(3);
  });

  it('never returns tier 4 from score alone', () => {
    expect(resolveFollowupTier({ ...base, readinessScore: 10 })).toBe(3);
  });

  it('forces tier 4 on the last permitted round, regardless of score', () => {
    expect(
      resolveFollowupTier({ readinessScore: 0, askedRound: 10, maxFollowupRounds: 10, tierFloor: 1 })
    ).toBe(4);
  });

  it('clamps monotonically — never regresses below the floor', () => {
    // Low score would be tier 1, but we have already shown tier 3.
    expect(
      resolveFollowupTier({ readinessScore: 0, askedRound: 2, maxFollowupRounds: 10, tierFloor: 3 })
    ).toBe(3);
  });

  it('does not let the floor push a non-terminal round to tier 4', () => {
    const tier = resolveFollowupTier({
      readinessScore: 7,
      askedRound: 2,
      maxFollowupRounds: 10,
      tierFloor: 3,
    });
    expect(tier).toBe(3);
  });
});

describe('pickFollowupLine', () => {
  it('returns a line from the requested tier bank', () => {
    for (const tier of [1, 2, 3, 4] as FollowupTier[]) {
      const { line, index } = pickFollowupLine(tier, -1, () => 0);
      expect(line).toBe(FOLLOWUP_LINES[tier][index]);
    }
  });

  it('never repeats the immediately-previous line index', () => {
    // rng forces the same index as lastIndex; selection must shift off it.
    const bank = FOLLOWUP_LINES[1];
    const lastIndex = 2;
    const forceSame = () => lastIndex / bank.length; // floor(rng * len) === lastIndex
    const { index } = pickFollowupLine(1, lastIndex, forceSame);
    expect(index).not.toBe(lastIndex);
  });

  it('is stable when there is no previous line', () => {
    const { index } = pickFollowupLine(2, -1, () => 0.99);
    expect(index).toBe(FOLLOWUP_LINES[2].length - 1);
  });
});
