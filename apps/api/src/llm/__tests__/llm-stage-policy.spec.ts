import { CacheAffinity, routingKeyFor, STAGE_POLICY } from '../llm-stage-policy';
import { Stage } from '../model-variants';

const ALL_STAGES = Object.values(Stage);
const CONVERSATION_ID = '6a69c487bb4d6ded62dbe9e0';

describe('STAGE_POLICY', () => {
  it('covers every stage', () => {
    // The Record<Stage, _> type already enforces this; asserted anyway so the
    // intent survives a future refactor that loosens the type.
    expect(Object.keys(STAGE_POLICY).sort()).toEqual([...ALL_STAGES].sort());
  });

  it('gives every stage a positive token budget and a valid temperature', () => {
    for (const stage of ALL_STAGES) {
      const policy = STAGE_POLICY[stage];
      expect(policy.maxTokens).toBeGreaterThan(0);
      expect(policy.temperature).toBeGreaterThanOrEqual(0);
      expect(policy.temperature).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Affinity costs throughput — a pinned stage binds a whole journey to one key's
   * rate limit — so it is opt-in per stage, never the default. Pinning this keeps
   * a future stage from being marked Journey without the prefix analysis that
   * justifies it.
   */
  it('pins only check_completeness', () => {
    const pinned = ALL_STAGES.filter(
      (stage) => STAGE_POLICY[stage].cacheAffinity === CacheAffinity.Journey
    );
    expect(pinned).toEqual([Stage.CheckCompleteness]);
  });
});

describe('routingKeyFor', () => {
  it('returns the bare conversationId for a Journey stage, so its calls stay together', () => {
    expect(routingKeyFor(Stage.CheckCompleteness, CONVERSATION_ID)).toBe(CONVERSATION_ID);
  });

  it('is stable across calls for a Journey stage', () => {
    const first = routingKeyFor(Stage.CheckCompleteness, CONVERSATION_ID);
    const second = routingKeyFor(Stage.CheckCompleteness, CONVERSATION_ID);
    expect(first).toBe(second);
  });

  it('varies per call for a None stage, so its calls spread across a pool', () => {
    const keys = new Set(
      Array.from({ length: 20 }, () => routingKeyFor(Stage.Cleaning, CONVERSATION_ID))
    );
    // Asserting the CONTRACT (the key varies), not the value — so no rng
    // injection is needed and the implementation stays free to change.
    expect(keys.size).toBe(20);
  });

  it('never returns the bare conversationId for a None stage', () => {
    for (const stage of ALL_STAGES.filter(
      (s) => STAGE_POLICY[s].cacheAffinity === CacheAffinity.None
    )) {
      expect(routingKeyFor(stage, CONVERSATION_ID)).not.toBe(CONVERSATION_ID);
    }
  });

  it('keeps the conversationId and stage in the key so it is readable in logs', () => {
    expect(routingKeyFor(Stage.Cleaning, CONVERSATION_ID)).toContain(CONVERSATION_ID);
    expect(routingKeyFor(Stage.Cleaning, CONVERSATION_ID)).toContain(Stage.Cleaning);
  });
});
