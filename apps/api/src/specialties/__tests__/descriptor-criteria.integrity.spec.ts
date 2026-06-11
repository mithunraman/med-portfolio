import { leafProbes } from '@acme/shared';
import { getAllSpecialtyOptions, getSpecialtyConfig } from '../specialty.registry';

/**
 * Single source of truth for grading quality: every assessable probe (required +
 * has an extractionQuestion) MUST carry a descriptorCriteria rubric, because the
 * check-completeness node grades content against it with no fallback heuristic.
 *
 * Enforced on ACTIVE specialties only — inactive ones can't run the graph, and
 * get their rubrics when activated.
 */
describe('descriptorCriteria integrity (active specialties)', () => {
  const activeSpecialties = getAllSpecialtyOptions().map((o) => o.specialty);

  it('has at least one active specialty to check', () => {
    expect(activeSpecialties.length).toBeGreaterThan(0);
  });

  it.each(activeSpecialties)(
    'every assessable probe in specialty %s has a descriptorCriteria rubric',
    (specialty) => {
      const config = getSpecialtyConfig(specialty);

      for (const [templateId, template] of Object.entries(config.templates)) {
        const assessable = leafProbes(template).filter(
          (p) => p.required && p.extractionQuestion !== null
        );

        for (const probe of assessable) {
          const hasRubric =
            typeof probe.descriptorCriteria === 'string' &&
            probe.descriptorCriteria.trim().length > 0;

          expect(hasRubric).toBe(true);
          if (!hasRubric) {
            throw new Error(
              `Missing descriptorCriteria: ${templateId} / probe "${probe.id}" is assessable but has no rubric.`
            );
          }
        }
      }
    }
  );
});
