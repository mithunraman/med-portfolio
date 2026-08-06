import { appearsIn, matchModeFor, survivesRedaction } from '../matching';

describe('G-1 matching', () => {
  describe('match mode selection', () => {
    it('routes checksum/format identifiers to structured matching', () => {
      expect(matchModeFor('NHS_NUMBER')).toBe('structured');
      expect(matchModeFor('postcode')).toBe('structured');
    });

    it('defaults unknown types to lexical, the safer of the two', () => {
      expect(matchModeFor('PERSON')).toBe('lexical');
      expect(matchModeFor('SOMETHING_NOBODY_ANTICIPATED')).toBe('lexical');
    });
  });

  describe('structured identifiers — separators must not decide the answer', () => {
    it('finds an NHS number however it is spaced', () => {
      // The same identifier. Reporting one of these as caught would inflate recall.
      expect(appearsIn('999 100 0003', 'his number is 9991000003 on file', 'NHS_NUMBER')).toBe(true);
      expect(appearsIn('9991000003', 'NHS number 999 100 0003, came in', 'NHS_NUMBER')).toBe(true);
    });

    it('reports a redacted NHS number as gone', () => {
      expect(appearsIn('999 100 0003', 'NHS number [NHS_NUMBER], came in', 'NHS_NUMBER')).toBe(false);
    });

    it('matches a postcode across a case and spacing change', () => {
      expect(appearsIn('BA11 7XQ', 'lives at ba117xq now', 'POSTCODE')).toBe(true);
    });

    it('handles a spoken structured identifier, since both sides normalise alike', () => {
      expect(
        appearsIn('B A eleven seven X Q', 'the postcode is like B A eleven\nseven X Q something', 'POSTCODE')
      ).toBe(true);
    });
  });

  describe('lexical identifiers — boundaries must be respected', () => {
    it('does not match a name inside a longer word', () => {
      // The reason structured matching cannot be used for everything: stripping
      // separators would make this true and report a leak that did not happen.
      expect(appearsIn('Bell', 'the Bellwether report', 'PERSON')).toBe(false);
    });

    it('matches a name that is genuinely present', () => {
      expect(appearsIn('Bell', 'Miss Bell presented with a droop', 'PERSON')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(appearsIn('Patel', 'saw mrs patel today', 'PERSON')).toBe(true);
    });

    it('matches across a line break in the source YAML', () => {
      // Corpus prose is stored as wrapped block scalars, so a multi-word value
      // is routinely split. Without whitespace collapsing this scores as caught.
      expect(appearsIn('Marlbrook Vale Surgery', 'at Marlbrook Vale\nSurgery this morning', 'ORGANISATION')).toBe(
        true
      );
    });

    it('matches a value ending in punctuation, where \\b would fail', () => {
      expect(appearsIn('J.T.', 'the case of J.T. for my portfolio', 'PERSON')).toBe(true);
    });

    it('matches a name adjacent to a hyphen', () => {
      expect(appearsIn('Oyelaran', 'Mrs Fitzwilliam-Oyelaran came about', 'PERSON')).toBe(true);
    });

    it('treats a hyphen as a space, so re-hyphenation cannot hide a leak', () => {
      // The 2026-08-05 false pass: the corpus planted `nine year old`, cleaning
      // emitted `nine-year-old`, and the scorer called it caught. Hyphenation is
      // a formatting choice an LLM makes freely — it must not decide whether an
      // identifier counts as leaked.
      expect(appearsIn('nine year old', 'This was a nine-year-old girl', 'AGE')).toBe(true);
      expect(appearsIn('4-year-old', 'and a 4 year old with a limp', 'AGE')).toBe(true);
    });

    it('still resolves a full hyphenated name after normalisation', () => {
      expect(appearsIn('Fitzwilliam-Oyelaran', 'Mrs Fitzwilliam Oyelaran attended', 'PERSON')).toBe(true);
      expect(appearsIn('Bell', 'the Bellwether-report', 'PERSON')).toBe(false);
    });

    it('treats non-ASCII letters as letters, not as boundaries', () => {
      expect(appearsIn('Nguyễn', 'Mrs Nguyễn attended', 'PERSON')).toBe(true);
      expect(appearsIn('Ngu', 'Mrs Nguyễn attended', 'PERSON')).toBe(false);
    });

    it('reports a redacted name as gone', () => {
      expect(appearsIn('Patel', 'Saw Mrs [PERSON] again today', 'PERSON')).toBe(false);
    });

    it('finds a name that survived only partially', () => {
      // A partial leak is still a leak — the identifying token reached the model.
      expect(appearsIn('Patel', 'Saw Mrs [PERSON] Patel again', 'PERSON')).toBe(true);
    });
  });

  describe('must-survive terms', () => {
    it('finds clinical terms and service numbers that survived', () => {
      expect(survivesRedaction('NICE', 'per the NICE guidance')).toBe(true);
      expect(survivesRedaction('111', 'ring 111 versus 999')).toBe(true);
      expect(survivesRedaction('140/90', 'BP 140/90, sats 94%')).toBe(true);
    });

    it('does not find a service number inside a longer run of digits', () => {
      // Lexical matching is what makes this work; structural matching would
      // find "111" inside "01111 900412" and wrongly report survival.
      expect(survivesRedaction('111', 'called 01113 900412 twice')).toBe(false);
    });

    it('reports an over-redacted term as gone', () => {
      expect(survivesRedaction('NICE', 'per the [ORGANISATION] guidance')).toBe(false);
    });

    it('does not treat a different inflection as the same term', () => {
      // "debrief" is not present in "debriefed". Surfacing this as a mismatch is
      // what forces the corpus author to write the term as it actually appears.
      expect(survivesRedaction('debrief', 'We debriefed afterwards')).toBe(false);
    });
  });

  it('never matches an empty needle', () => {
    expect(appearsIn('', 'anything at all', 'PERSON')).toBe(false);
    expect(appearsIn('   ', 'anything at all', 'NHS_NUMBER')).toBe(false);
  });
});
