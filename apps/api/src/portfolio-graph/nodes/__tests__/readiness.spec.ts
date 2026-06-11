import { ArtefactTemplate, Probe } from '@acme/shared';
import { deriveReadiness } from '../check-completeness.node';
import { ReadinessTier } from '../../portfolio-graph.state';

/** Two probes in one output section: a factual one and a strong-threshold one. */
function makeTemplate(): ArtefactTemplate {
  const factual: Probe = {
    id: 'presentation',
    label: 'Presentation',
    required: true,
    description: '',
    promptHint: '',
    extractionQuestion: 'q',
    weight: 0.5,
  };
  const reflective: Probe = {
    id: 'reflection',
    label: 'Reflection',
    required: true,
    threshold: 'strong',
    description: '',
    promptHint: '',
    extractionQuestion: 'q',
    weight: 0.5,
  };
  return {
    id: 'T',
    name: 'T',
    wordCountRange: { min: 0, max: 100 },
    sections: [{ id: 'sec', label: 'Sec', order: 0, required: true, probes: [factual, reflective] }],
  };
}

describe('deriveReadiness', () => {
  const probes = makeTemplate().sections.flatMap((s) => s.probes);

  it("treats an 'adequate' factual probe as meeting its threshold", () => {
    const tiers: Record<string, ReadinessTier> = {
      presentation: 'adequate',
      reflection: 'strong',
    };
    const r = deriveReadiness(tiers, probes, makeTemplate());
    expect(r.missingProbeIds).toEqual([]);
    expect(r.probeReadiness.presentation.meetsThreshold).toBe(true);
    expect(r.probeReadiness.reflection.tier).toBe('strong');
  });

  it("flags an 'adequate' reflection as a gap because its threshold is 'strong'", () => {
    const tiers: Record<string, ReadinessTier> = {
      presentation: 'adequate',
      reflection: 'adequate',
    };
    const r = deriveReadiness(tiers, probes, makeTemplate());
    expect(r.missingProbeIds).toEqual(['reflection']);
    expect(r.probeReadiness.reflection.meetsThreshold).toBe(false);
    expect(r.sectionReadiness.sec.meetsThreshold).toBe(false);
  });

  it('produces a 0–10 score weighted by probe importance', () => {
    const tiers: Record<string, ReadinessTier> = {
      presentation: 'strong', // score 1.0 × 0.5
      reflection: 'missing', // score 0 × 0.5
    };
    const r = deriveReadiness(tiers, probes, makeTemplate());
    expect(r.readinessScore).toBeCloseTo(5.0, 1);
  });
});
