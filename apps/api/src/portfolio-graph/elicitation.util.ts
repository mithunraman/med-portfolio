import { PortfolioStateType, TIER_RANK } from './portfolio-graph.state';

/**
 * Elicitation exit policy — the pure, deterministic rules that decide when to stop
 * asking follow-up questions. Shared by the completeness router (whether to loop)
 * and generate_followup (which section to skip), so the policy has one home and is
 * unit-testable without the graph.
 */

/** Overall readiness (0–10) at which we compose rather than chase marginal depth. */
export const GOOD_ENOUGH_SCORE = 8.0;

/**
 * How many times a single section may be asked before it is retired if the answers
 * aren't improving its tier. 2 = one genuine second attempt, then stop.
 */
export const ATTEMPT_LIMIT = 2;

/**
 * A section is exhausted once it has been asked ATTEMPT_LIMIT times and re-asking is
 * no longer improving it (its current tier is no higher than when it was last asked).
 * Retiring it prevents the infinite re-ask loop and the coercive nagging that follows.
 */
export function isSectionExhausted(state: PortfolioStateType, sectionId: string): boolean {
  const attempt = state.sectionAttempts?.[sectionId];
  if (!attempt || attempt.count < ATTEMPT_LIMIT) return false;
  const currentTier = state.probeReadiness?.[sectionId]?.tier ?? 'missing';
  return TIER_RANK[currentTier] <= TIER_RANK[attempt.tierAtLastAsk];
}

/** Whether a section has been asked at least once. */
export function hasBeenAsked(state: PortfolioStateType, sectionId: string): boolean {
  return (state.sectionAttempts?.[sectionId]?.count ?? 0) > 0;
}

/**
 * "Good enough" to compose: overall readiness clears the bar AND every still-unmet
 * section at least has some content (nothing is a zero-content `missing`, which would
 * compose empty). Lets a thin-but-present section pass without looping on it.
 *
 * Only LIVE gaps count here — a retired (exhausted) `missing` section will compose
 * empty no matter how long we loop, so it must not veto the good-enough exit.
 * Otherwise it pins this false for the rest of the run and the loop nags every other
 * live gap to exhaustion instead of composing (the coercive-nagging regression). This
 * keeps the gap-set consistent with `shouldContinueElicitation`'s `liveGaps`.
 */
export function isGoodEnough(state: PortfolioStateType): boolean {
  if (state.readinessScore < GOOD_ENOUGH_SCORE) return false;
  return !state.missingSections
    .filter((id) => !isSectionExhausted(state, id))
    .some((id) => (state.probeReadiness?.[id]?.tier ?? 'missing') === 'missing');
}

/**
 * Whether to run another follow-up round. Exits (returns false) when the rubric is
 * fully met, the round cap is hit, or every remaining gap is exhausted. Otherwise
 * keeps eliciting — and does NOT settle for "good enough" until every required gap has
 * had at least one ask (leverage ranking can otherwise starve a section that looks
 * partly-done — e.g. content that bled in from another section — so it never gets its
 * own question).
 */
export function shouldContinueElicitation(
  state: PortfolioStateType,
  maxRounds: number
): boolean {
  if (state.hasEnoughInfo) return false; // every probe met its threshold
  if (state.followUpRound >= maxRounds) return false; // circuit-breaker backstop

  // Gaps still worth asking about — those the exhaustion cap hasn't retired.
  const liveGaps = state.missingSections.filter((id) => !isSectionExhausted(state, id));
  if (liveGaps.length === 0) return false; // nothing productive left to ask

  // Coverage floor: give every required gap its first ask before composing.
  if (liveGaps.some((id) => !hasBeenAsked(state, id))) return true;

  if (isGoodEnough(state)) return false; // complete enough — compose rather than nitpick

  return true;
}
