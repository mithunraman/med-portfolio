import { gatherContextRouter, classifyRouter, CONFIDENCE_THRESHOLD, MAX_CLARIFICATION_ROUNDS } from '../portfolio-graph.builder';
import type { PortfolioStateType } from '../portfolio-graph.state';

function s(overrides: Partial<PortfolioStateType>): PortfolioStateType {
  return overrides as PortfolioStateType;
}

describe('gatherContextRouter', () => {
  it('routes to classify when classificationConfirmed is false', () => {
    expect(gatherContextRouter(s({ classificationConfirmed: false }))).toBe('classify');
  });

  it('routes to check_completeness when classificationConfirmed is true', () => {
    expect(gatherContextRouter(s({ classificationConfirmed: true }))).toBe('check_completeness');
  });
});

describe('classifyRouter', () => {
  it('routes to present_classification when confidence meets threshold', () => {
    expect(
      classifyRouter(s({ classificationConfidence: CONFIDENCE_THRESHOLD, clarificationRound: 0 }))
    ).toBe('present_classification');
  });

  it('routes to present_classification when confidence is above threshold', () => {
    expect(
      classifyRouter(s({ classificationConfidence: 0.9, clarificationRound: 0 }))
    ).toBe('present_classification');
  });

  it('routes to ask_clarification when confidence is below threshold and rounds remain', () => {
    expect(
      classifyRouter(s({ classificationConfidence: 0.5, clarificationRound: 0 }))
    ).toBe('ask_clarification');
  });

  it('routes to ask_clarification on second low-confidence round', () => {
    expect(
      classifyRouter(s({ classificationConfidence: 0.5, clarificationRound: 1 }))
    ).toBe('ask_clarification');
  });

  it('falls through to present_classification after max clarification rounds', () => {
    expect(
      classifyRouter(s({ classificationConfidence: 0.5, clarificationRound: MAX_CLARIFICATION_ROUNDS }))
    ).toBe('present_classification');
  });
});
