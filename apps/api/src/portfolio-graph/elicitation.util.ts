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
 * Sections that met their threshold ONLY at the floor tier ('adequate') and have not
 * been asked directly yet. Such a section may have been satisfied by content that bled
 * in from another section's answer (e.g. a reflection clause partitioned into learning
 * needs), so we still owe it one direct ask before crediting it — "confirm a borderline
 * pass before shipping it".
 *
 * Derivable from readiness alone: `meetsThreshold && tier === 'adequate'` can only hold
 * when the probe's threshold is 'adequate' — a 'strong'-threshold probe at 'adequate' is
 * an unmet gap already carried in `missingSections`. So no template/threshold lookup is
 * needed here. A 'strong' pass is unambiguous and never force-asked.
 */
export function unconfirmedSections(state: PortfolioStateType): string[] {
  const pr = state.probeReadiness ?? {};
  return Object.keys(pr).filter(
    (id) => pr[id].meetsThreshold && pr[id].tier === 'adequate' && !hasBeenAsked(state, id)
  );
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
 * fully met AND every section has had its first ask, the round cap is hit, or every
 * remaining gap is exhausted. Otherwise keeps eliciting.
 *
 * Coverage floor: it does NOT settle for "good enough" until every required section has
 * had at least one DIRECT ask — a below-threshold gap OR a section that only just met
 * its bar at the 'adequate' floor (which may have been satisfied by content that bled in
 * from another section's answer, so it never got its own question). This is the guard
 * that stops a borderline pass shipping un-elicited.
 */
export function shouldContinueElicitation(
  state: PortfolioStateType,
  maxRounds: number
): boolean {
  // Hard circuit-breaker FIRST — guarantees termination regardless of the coverage floor
  // below. The cap is assessable sections × ATTEMPT_LIMIT (see check-completeness.node.ts),
  // which reserves room for every section's one forced first ask; keep the two in lockstep.
  if (state.followUpRound >= maxRounds) return false;

  // Gaps still worth asking about — those the exhaustion cap hasn't retired.
  const liveGaps = state.missingSections.filter((id) => !isSectionExhausted(state, id));

  // Coverage floor: every required section gets ≥1 direct ask before we compose — live
  // gaps AND sections that only just met their bar at 'adequate'. Bounded to ≤1 forced
  // ask/section by hasBeenAsked, and the round cap above backstops it.
  const needsFirstAsk = [...liveGaps, ...unconfirmedSections(state)].filter(
    (id) => !hasBeenAsked(state, id)
  );
  if (needsFirstAsk.length > 0) return true;

  if (state.hasEnoughInfo) return false; // thresholds met AND every section confirmed
  if (liveGaps.length === 0) return false; // only exhausted gaps remain
  if (isGoodEnough(state)) return false; // complete enough — compose rather than nitpick

  return true;
}
