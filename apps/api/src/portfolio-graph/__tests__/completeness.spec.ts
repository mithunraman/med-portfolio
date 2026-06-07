import { deriveCompleteness } from '../completeness';
import { PortfolioStateType } from '../portfolio-graph.state';

/** Build a minimal state — deriveCompleteness only reads four fields. */
function makeState(overrides: Partial<PortfolioStateType>): PortfolioStateType {
  return {
    missingSections: [],
    sectionCoverage: {},
    hasEnoughInfo: true,
    reflection: null,
    ...overrides,
  } as PortfolioStateType;
}

describe('deriveCompleteness', () => {
  it('reports complete with no unmet sections when hasEnoughInfo is true', () => {
    const result = deriveCompleteness(makeState({ hasEnoughInfo: true, missingSections: [] }));
    expect(result).toEqual({ complete: true, unmetSections: [] });
  });

  it('marks an uncovered section as missing', () => {
    const result = deriveCompleteness(
      makeState({
        hasEnoughInfo: false,
        missingSections: ['reflection'],
        sectionCoverage: { reflection: { covered: false, depth: 'shallow' } },
        reflection: [
          { sectionId: 'reflection', title: 'Reflection & Learning', text: '', covered: false },
        ],
      })
    );
    expect(result.complete).toBe(false);
    expect(result.unmetSections).toEqual([
      { sectionId: 'reflection', label: 'Reflection & Learning', status: 'missing' },
    ]);
  });

  it('marks a covered-but-shallow section as shallow (bare verdict case)', () => {
    const result = deriveCompleteness(
      makeState({
        hasEnoughInfo: false,
        missingSections: ['reflection'],
        sectionCoverage: { reflection: { covered: true, depth: 'shallow' } },
        reflection: [
          { sectionId: 'reflection', title: 'Reflection & Learning', text: 'it went ok', covered: true },
        ],
      })
    );
    expect(result.unmetSections[0].status).toBe('shallow');
  });

  it('lists both factual and reflective unmet sections (general scope, not reflection-only)', () => {
    const result = deriveCompleteness(
      makeState({
        hasEnoughInfo: false,
        missingSections: ['outcome', 'reflection'],
        sectionCoverage: {
          outcome: { covered: false, depth: 'shallow' },
          reflection: { covered: true, depth: 'shallow' },
        },
        reflection: [
          { sectionId: 'outcome', title: 'Patient Outcome', text: '', covered: false },
          { sectionId: 'reflection', title: 'Reflection & Learning', text: 'fine', covered: true },
        ],
      })
    );
    expect(result.unmetSections).toHaveLength(2);
    expect(result.unmetSections.map((s) => s.sectionId)).toEqual(['outcome', 'reflection']);
    expect(result.unmetSections.map((s) => s.status)).toEqual(['missing', 'shallow']);
  });

  it('falls back to the section id when no reflection title is present', () => {
    const result = deriveCompleteness(
      makeState({
        hasEnoughInfo: false,
        missingSections: ['management'],
        sectionCoverage: { management: { covered: false, depth: 'shallow' } },
        reflection: null,
      })
    );
    expect(result.unmetSections[0].label).toBe('management');
  });
});
