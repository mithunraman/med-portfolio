import { adjustConfidence } from '../classify.node';

describe('adjustConfidence', () => {
  // ── Relevance gate ──

  it('should return 0 when isRelevant is false regardless of other factors', () => {
    expect(adjustConfidence(0.95, 200, 5, [], false)).toBe(0);
  });

  it('should return 0 when isRelevant is false even with high raw confidence', () => {
    expect(adjustConfidence(1.0, 1000, 10, [], false)).toBe(0);
  });

  // ── Normal rules when relevant ──

  it('should pass through high confidence when all signals are strong', () => {
    expect(adjustConfidence(0.95, 200, 5, [], true)).toBe(0.95);
  });

  it('should cap at 0.85 when transcript is shorter than 50 words', () => {
    expect(adjustConfidence(0.95, 30, 5, [], true)).toBe(0.85);
  });

  it('should cap at 0.9 when fewer than 2 signals are found', () => {
    expect(adjustConfidence(0.95, 200, 1, [], true)).toBe(0.9);
  });

  it('should reduce by 0.1 when top alternative is within 0.15', () => {
    const alternatives = [{ entryType: 'ALT', confidence: 0.88, reasoning: 'close' }];
    // raw=0.95, adjusted starts at 0.95, alt is 0.88, gap=0.07 < 0.15 → 0.95-0.1=0.85
    expect(adjustConfidence(0.95, 200, 5, alternatives, true)).toBe(0.85);
  });

  it('should apply multiple caps (short transcript + few signals)', () => {
    // raw=0.95, short (<50 words) → cap 0.85, few signals (<2) → cap 0.9
    // min(0.85, 0.9) = 0.85
    expect(adjustConfidence(0.95, 30, 1, [], true)).toBe(0.85);
  });

  it('should not reduce below 0 when alternative gap triggers reduction', () => {
    const alternatives = [{ entryType: 'ALT', confidence: 0.05, reasoning: 'close' }];
    // raw=0.05, gap=0.0 < 0.15 → 0.05-0.1 → clamped to 0
    expect(adjustConfidence(0.05, 200, 5, alternatives, true)).toBe(0);
  });

  it('should round to 2 decimal places', () => {
    expect(adjustConfidence(0.777, 200, 5, [], true)).toBe(0.78);
  });
});
