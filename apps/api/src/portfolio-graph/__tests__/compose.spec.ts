import { ArtefactTemplate } from '@acme/shared';
import { composeDocument } from '../compose';

function makeTemplate(): ArtefactTemplate {
  const probe = (id: string, weight = 0.5) => ({
    id,
    label: id,
    required: true,
    description: '',
    promptHint: '',
    extractionQuestion: 'q',
    weight,
  });
  return {
    id: 'T',
    name: 'T',
    wordCountRange: { min: 0, max: 100 },
    sections: [
      {
        id: 'brief_description',
        label: 'Brief Description',
        order: 0,
        required: true,
        probes: [probe('presentation'), probe('management')],
      },
      {
        id: 'considerations',
        label: 'Considerations',
        order: 1,
        required: false,
        probes: [probe('ethical_legal')],
      },
    ],
  };
}

describe('composeDocument', () => {
  it('groups multiple probe texts into one output field, in probe order', () => {
    const result = composeDocument(makeTemplate(), [
      { sectionId: 'management', title: 'M', text: 'I started a DOAC.', covered: true },
      { sectionId: 'presentation', title: 'P', text: 'A 64-year-old woman.', covered: true },
      { sectionId: 'ethical_legal', title: 'E', text: '', covered: false },
    ]);

    expect(result).toHaveLength(1); // optional empty section dropped
    expect(result[0].sectionId).toBe('brief_description');
    // Probe order (presentation before management) is preserved.
    expect(result[0].text).toBe('A 64-year-old woman.\n\nI started a DOAC.');
  });

  it('keeps required sections even when empty, drops empty optional ones', () => {
    const result = composeDocument(makeTemplate(), []);
    expect(result.map((s) => s.sectionId)).toEqual(['brief_description']);
    expect(result[0].text).toBe('');
  });
});
