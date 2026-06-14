import { deriveCompleteness } from '../completeness';
import { PortfolioStateType, ReadinessEntry, ReadinessTier } from '../portfolio-graph.state';

/** Terse ReadinessEntry — deriveCompleteness only reads `.tier`. */
const entry = (tier: ReadinessTier): ReadinessEntry => ({ score: 0, tier, meetsThreshold: false });

/**
 * Build a minimal state — deriveCompleteness reads missingSections, probeReadiness,
 * hasEnoughInfo, and resolves labels from the template (specialty + entryType).
 * Specialty '100' is GP; entry type CLINICAL_CASE_REVIEW uses the CCR template.
 */
function makeState(overrides: Partial<PortfolioStateType>): PortfolioStateType {
  return {
    specialty: '100',
    entryType: 'CLINICAL_CASE_REVIEW',
    missingSections: [],
    probeReadiness: {},
    hasEnoughInfo: true,
    ...overrides,
  } as PortfolioStateType;
}

describe('deriveCompleteness', () => {
  it('reports complete with no unmet sections when hasEnoughInfo is true', () => {
    const result = deriveCompleteness(makeState({ hasEnoughInfo: true, missingSections: [] }));
    expect(result).toEqual({ complete: true, unmetSections: [] });
  });

  it('marks an uncovered (missing-tier) section as missing, labelled from the template', () => {
    const result = deriveCompleteness(
      makeState({
        hasEnoughInfo: false,
        missingSections: ['reflection'],
        probeReadiness: { reflection: entry('missing') },
      })
    );
    expect(result.complete).toBe(false);
    expect(result.unmetSections).toEqual([
      { sectionId: 'reflection', label: 'Reflection', status: 'missing' },
    ]);
  });

  it('marks a covered-but-shallow section as shallow (bare verdict case)', () => {
    const result = deriveCompleteness(
      makeState({
        hasEnoughInfo: false,
        missingSections: ['reflection'],
        probeReadiness: { reflection: entry('shallow') },
      })
    );
    expect(result.unmetSections[0].status).toBe('shallow');
  });

  it('lists both factual and reflective unmet sections (general scope, not reflection-only)', () => {
    const result = deriveCompleteness(
      makeState({
        hasEnoughInfo: false,
        missingSections: ['outcome', 'reflection'],
        probeReadiness: { outcome: entry('missing'), reflection: entry('shallow') },
      })
    );
    expect(result.unmetSections).toHaveLength(2);
    expect(result.unmetSections.map((s) => s.sectionId)).toEqual(['outcome', 'reflection']);
    expect(result.unmetSections.map((s) => s.label)).toEqual(['Patient Outcome', 'Reflection']);
    expect(result.unmetSections.map((s) => s.status)).toEqual(['missing', 'shallow']);
  });

  it('falls back to the section id when no template is resolvable (no entry type yet)', () => {
    const result = deriveCompleteness(
      makeState({
        entryType: undefined,
        hasEnoughInfo: false,
        missingSections: ['management'],
        probeReadiness: { management: entry('missing') },
      })
    );
    expect(result.unmetSections[0].label).toBe('management');
  });
});
