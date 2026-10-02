import { MessageRole } from '@acme/shared';
import { getAllRegisteredConfigs, getTemplateForEntryType } from '../specialty.registry';

/**
 * A sample case is served publicly and cached, and it is assembled from codes that
 * must resolve against the specialty's own config. These checks make a template or
 * capability change that strands the sample fail CI rather than reach a trainee.
 *
 * Runs over every registered config (active or not), so a sample is valid before
 * its specialty is switched on.
 */

// Placeholders the redaction pipeline writes into text. Their presence means the
// sample was lifted from a redacted real run — it must be fictional, never redacted.
const REDACTION_PLACEHOLDER = /\[(PERSON|NAME|DATE|PHONE|EMAIL|NHS|ADDRESS|LOCATION)[^\]]*\]/i;

const withSamples = getAllRegisteredConfigs()
  .filter((config) => config.sampleCase !== undefined)
  .map((config) => [config.name, config] as const);

describe('sample case integrity', () => {
  it('has at least one sample to check', () => {
    expect(withSamples.length).toBeGreaterThan(0);
  });

  describe.each(withSamples)('%s', (_name, config) => {
    const sample = config.sampleCase!;

    it('uses an entry type of its own specialty', () => {
      expect(config.entryTypes.map((e) => e.code)).toContain(sample.entryType);
    });

    it("has exactly the entry type's template sections, in template order", () => {
      const template = getTemplateForEntryType(config, sample.entryType);
      const expected = [...template.sections].sort((a, b) => a.order - b.order).map((s) => s.id);

      expect(sample.sections.map((s) => s.sectionId)).toEqual(expected);
    });

    it('only references capabilities that exist in the specialty, once each', () => {
      const known = new Set(config.capabilities.map((c) => c.code));
      const codes = sample.capabilities.map((c) => c.code);

      expect(codes.length).toBeGreaterThan(0);
      expect(codes.filter((code) => !known.has(code))).toEqual([]);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('opens with the trainee, and every assistant turn asks a question', () => {
      expect(sample.conversation[0]?.role).toBe(MessageRole.USER);

      for (const turn of sample.conversation.filter((t) => t.role === MessageRole.ASSISTANT)) {
        expect(turn.question?.trim()).toBeTruthy();
      }
    });

    it('gives every PDP goal at least one action and a whole-day review window', () => {
      for (const goal of sample.pdpGoals) {
        expect(goal.actions.length).toBeGreaterThan(0);
        expect(Number.isInteger(goal.reviewAfterDays)).toBe(true);
        expect(goal.reviewAfterDays).toBeGreaterThan(0);
      }
    });

    it('has no empty text and no redaction placeholders', () => {
      const texts = [
        sample.title,
        ...sample.sections.map((s) => s.text),
        ...sample.capabilities.flatMap((c) => [c.evidence, c.justification]),
        ...sample.pdpGoals.flatMap((g) => [
          g.goal,
          ...g.actions.flatMap((a) => [a.action, a.intendedEvidence]),
        ]),
        ...sample.conversation.map((t) => t.text),
        ...sample.conversation.flatMap((t) => (t.question === undefined ? [] : [t.question])),
      ];

      for (const text of texts) {
        expect(text.trim()).not.toBe('');
        expect(text).not.toMatch(REDACTION_PLACEHOLDER);
      }
    });
  });
});
