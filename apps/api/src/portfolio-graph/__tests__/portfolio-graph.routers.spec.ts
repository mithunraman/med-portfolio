import { END } from '@langchain/langgraph';
import { capabilitiesRouter, completenessRouter } from '../portfolio-graph.builder';
import type { PortfolioStateType } from '../portfolio-graph.state';

function s(overrides: Partial<PortfolioStateType>): PortfolioStateType {
  return overrides as PortfolioStateType;
}

/** A relevant, mid-journey state with one live gap — the "keep eliciting" baseline. */
function completenessState(overrides: Partial<PortfolioStateType> = {}): PortfolioStateType {
  return s({
    isRelevant: true,
    followUpRound: 0,
    hasEnoughInfo: false,
    missingSections: ['reflection'],
    maxFollowupRounds: 8,
    sectionAttempts: {},
    probeReadiness: {},
    readinessScore: 3,
    ...overrides,
  });
}

describe('completenessRouter', () => {
  it('keeps eliciting while a live gap remains', () => {
    expect(completenessRouter(completenessState())).toBe('generate_followup');
  });

  it('proceeds to tag_capabilities once the rubric is met', () => {
    expect(completenessRouter(completenessState({ hasEnoughInfo: true, missingSections: [] }))).toBe(
      'tag_capabilities'
    );
  });

  // ── Relevance gate (first pass only) ──

  it('rejects an irrelevant transcript on the first pass', () => {
    expect(completenessRouter(completenessState({ isRelevant: false }))).toBe('reject_entry');
  });

  it('does NOT reject an irrelevant verdict after the first pass', () => {
    // The grader re-assesses relevance every round; a late false verdict must not
    // terminate a journey the trainee has already invested rounds in.
    expect(completenessRouter(completenessState({ isRelevant: false, followUpRound: 1 }))).toBe(
      'generate_followup'
    );
  });

  it('does NOT reject a late irrelevant verdict even when the entry is otherwise done', () => {
    expect(
      completenessRouter(
        completenessState({
          isRelevant: false,
          followUpRound: 3,
          hasEnoughInfo: true,
          missingSections: [],
        })
      )
    ).toBe('tag_capabilities');
  });
});

describe('capabilitiesRouter', () => {
  it('composes the entry when capabilities were confirmed', () => {
    expect(
      capabilitiesRouter(s({ capabilities: [{ code: 'C-06' }] as never }))
    ).toBe('elicit_justification');
  });

  it('ends the run when no capabilities were confirmed', () => {
    // Replaces the old `entryType: null` sentinel and the seven per-node guards
    // that read it: a run with nothing to justify cannot compose an entry.
    expect(capabilitiesRouter(s({ capabilities: [] }))).toBe(END);
  });
});
