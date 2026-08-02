import {
  ATTEMPT_LIMIT,
  GOOD_ENOUGH_SCORE,
  hasBeenAsked,
  isGoodEnough,
  isSectionExhausted,
  shouldContinueElicitation,
  unconfirmedSections,
} from '../elicitation.util';
import type { PortfolioStateType, ReadinessEntry, ReadinessTier } from '../portfolio-graph.state';

const MAX = 8;

const entry = (tier: ReadinessTier): ReadinessEntry => ({ tier, score: 0, meetsThreshold: false });

/** A section that meets its threshold (as `deriveReadiness` would mark a passing probe). */
const met = (tier: ReadinessTier): ReadinessEntry => ({ tier, score: 0, meetsThreshold: true });

function st(overrides: Partial<PortfolioStateType> = {}): PortfolioStateType {
  return {
    hasEnoughInfo: false,
    followUpRound: 1,
    missingSections: [],
    sectionAttempts: {},
    probeReadiness: {},
    readinessScore: 0,
    ...overrides,
  } as PortfolioStateType;
}

describe('isSectionExhausted', () => {
  it('is false before ATTEMPT_LIMIT asks', () => {
    const s = st({
      sectionAttempts: { outcome: { count: ATTEMPT_LIMIT - 1, tierAtLastAsk: 'shallow' } },
      probeReadiness: { outcome: entry('shallow') },
    });
    expect(isSectionExhausted(s, 'outcome')).toBe(false);
  });

  it('is true at ATTEMPT_LIMIT when the tier has not improved', () => {
    const s = st({
      sectionAttempts: { outcome: { count: ATTEMPT_LIMIT, tierAtLastAsk: 'shallow' } },
      probeReadiness: { outcome: entry('shallow') },
    });
    expect(isSectionExhausted(s, 'outcome')).toBe(true);
  });

  it('is false at ATTEMPT_LIMIT when re-asking improved the tier (still productive)', () => {
    const s = st({
      sectionAttempts: { outcome: { count: ATTEMPT_LIMIT, tierAtLastAsk: 'shallow' } },
      probeReadiness: { outcome: entry('adequate') },
    });
    expect(isSectionExhausted(s, 'outcome')).toBe(false);
  });
});

describe('isGoodEnough', () => {
  it('true when readiness clears the bar and no gap is zero-content', () => {
    const s = st({
      readinessScore: GOOD_ENOUGH_SCORE,
      missingSections: ['outcome'],
      probeReadiness: { outcome: entry('shallow') },
    });
    expect(isGoodEnough(s)).toBe(true);
  });

  it('false when a remaining gap has zero content (would compose empty)', () => {
    const s = st({
      readinessScore: 9,
      missingSections: ['outcome'],
      probeReadiness: { outcome: entry('missing') },
    });
    expect(isGoodEnough(s)).toBe(false);
  });

  it('false below the readiness bar', () => {
    expect(isGoodEnough(st({ readinessScore: GOOD_ENOUGH_SCORE - 0.1 }))).toBe(false);
  });

  it('ignores a retired (exhausted) missing section so it cannot veto good-enough', () => {
    // `outcome` is genuinely unanswerable: asked to the cap, still missing, retired.
    // It would compose empty regardless, so it must not block the exit; the live
    // shallow `learning` gap has content, so nothing zero-content remains live.
    const s = st({
      readinessScore: 9,
      missingSections: ['outcome', 'learning'],
      sectionAttempts: { outcome: { count: ATTEMPT_LIMIT, tierAtLastAsk: 'missing' } },
      probeReadiness: { outcome: entry('missing'), learning: entry('shallow') },
    });
    expect(isGoodEnough(s)).toBe(true);
  });
});

describe('shouldContinueElicitation', () => {
  const liveGap = {
    missingSections: ['outcome'],
    probeReadiness: { outcome: entry('shallow') },
  } as Partial<PortfolioStateType>;

  it('stops when the rubric is fully met', () => {
    expect(shouldContinueElicitation(st({ hasEnoughInfo: true }), MAX)).toBe(false);
  });

  it('stops at the round cap', () => {
    expect(shouldContinueElicitation(st({ ...liveGap, followUpRound: MAX }), MAX)).toBe(false);
  });

  it('stops when every remaining gap is exhausted', () => {
    const s = st({
      ...liveGap,
      sectionAttempts: { outcome: { count: ATTEMPT_LIMIT, tierAtLastAsk: 'shallow' } },
    });
    expect(shouldContinueElicitation(s, MAX)).toBe(false);
  });

  it('stops when good enough AND every live gap has had its first ask', () => {
    const s = st({
      ...liveGap,
      readinessScore: GOOD_ENOUGH_SCORE,
      sectionAttempts: { outcome: { count: 1, tierAtLastAsk: 'shallow' } }, // already asked once
    });
    expect(shouldContinueElicitation(s, MAX)).toBe(false);
  });

  it('defers good-enough while a required gap has never been asked (coverage floor)', () => {
    // readiness clears the bar, but the sole gap was never asked → ask it first.
    const s = st({ ...liveGap, readinessScore: GOOD_ENOUGH_SCORE }); // no sectionAttempts
    expect(shouldContinueElicitation(s, MAX)).toBe(true);
  });

  it('continues when a live, productive gap remains below the bar', () => {
    expect(shouldContinueElicitation(st({ ...liveGap, readinessScore: 5 }), MAX)).toBe(true);
  });

  it('composes once the only missing gap is retired, instead of nagging live gaps to exhaustion', () => {
    // `outcome` retired-missing (unanswerable); `learning` live+shallow, already asked.
    // Coverage floor is satisfied and readiness clears the bar, so good-enough must be
    // reachable — the retired gap must not keep the loop nagging `learning`.
    const s = st({
      readinessScore: 9,
      missingSections: ['outcome', 'learning'],
      sectionAttempts: {
        outcome: { count: ATTEMPT_LIMIT, tierAtLastAsk: 'missing' },
        learning: { count: 1, tierAtLastAsk: 'shallow' },
      },
      probeReadiness: { outcome: entry('missing'), learning: entry('shallow') },
    });
    expect(shouldContinueElicitation(s, MAX)).toBe(false);
  });
});

describe('unconfirmedSections', () => {
  it('flags a section that met its bar at the adequate floor but was never asked', () => {
    const s = st({ probeReadiness: { learning_needs: met('adequate') } });
    expect(unconfirmedSections(s)).toEqual(['learning_needs']);
  });

  it('excludes a strong pass (unambiguous — never force-asked)', () => {
    const s = st({ probeReadiness: { reflection: met('strong') } });
    expect(unconfirmedSections(s)).toEqual([]);
  });

  it('excludes an adequate section that has already been asked', () => {
    const s = st({
      probeReadiness: { learning_needs: met('adequate') },
      sectionAttempts: { learning_needs: { count: 1, tierAtLastAsk: 'adequate' } },
    });
    expect(unconfirmedSections(s)).toEqual([]);
  });

  it('excludes a below-threshold adequate (strong-threshold probe not yet passing)', () => {
    // meetsThreshold=false means the probe needs 'strong' — it is an unmet gap already
    // carried in missingSections, not a borderline pass to confirm.
    const s = st({ probeReadiness: { reflection: entry('adequate') } });
    expect(unconfirmedSections(s)).toEqual([]);
  });
});

describe('shouldContinueElicitation — adequate-but-unasked coverage floor', () => {
  it('forces a first ask for a borderline adequate section even when the rubric is met', () => {
    // hasEnoughInfo=true (nothing in missingSections), but learning_needs only just met
    // its bar at adequate and was never asked — likely credited by spilled content.
    const s = st({
      hasEnoughInfo: true,
      missingSections: [],
      probeReadiness: { learning_needs: met('adequate') },
    });
    expect(shouldContinueElicitation(s, MAX)).toBe(true);
  });

  it('stops once the borderline adequate section has had its one ask', () => {
    const s = st({
      hasEnoughInfo: true,
      missingSections: [],
      probeReadiness: { learning_needs: met('adequate') },
      sectionAttempts: { learning_needs: { count: 1, tierAtLastAsk: 'adequate' } },
    });
    expect(shouldContinueElicitation(s, MAX)).toBe(false);
  });

  it('does not force-ask a strong pass', () => {
    const s = st({
      hasEnoughInfo: true,
      missingSections: [],
      probeReadiness: { reflection: met('strong') },
    });
    expect(shouldContinueElicitation(s, MAX)).toBe(false);
  });

  it('the round cap still wins over the coverage floor (termination guaranteed)', () => {
    const s = st({
      followUpRound: MAX,
      hasEnoughInfo: true,
      probeReadiness: { learning_needs: met('adequate') },
    });
    expect(shouldContinueElicitation(s, MAX)).toBe(false);
  });
});

describe('hasBeenAsked', () => {
  it('is true only once a section has been asked at least once', () => {
    expect(hasBeenAsked(st(), 'outcome')).toBe(false);
    expect(
      hasBeenAsked(st({ sectionAttempts: { outcome: { count: 1, tierAtLastAsk: 'missing' } } }), 'outcome')
    ).toBe(true);
  });
});
