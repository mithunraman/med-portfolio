import { normaliseTypography } from '../typography.util';

describe('normaliseTypography', () => {
  it.each([
    ['zero-width space', 'gout\u200B was likely', 'gout was likely'],
    ['BOM and word joiner', '\uFEFFstarted\u2060 colchicine', 'started colchicine'],
    ['soft hyphen', 'colchi\u00ADcine', 'colchicine'],
    ['bidi control', 'rash \u202Esettled', 'rash settled'],
    ['unicode tag characters', 'reviewed\u{E0041}\u{E007F} today', 'reviewed today'],
    ['narrow no-break space', 'a\u202Fweek later', 'a week later'],
    ['no-break space', '500\u00A0mg', '500 mg'],
    ['spaced em dash', 'I paused \u2014 then called', 'I paused - then called'],
    ['unspaced em dash', 'I paused\u2014then called', 'I paused - then called'],
    ['em dash beside a zero-width space', 'paused\u200B\u2014then', 'paused - then'],
    ['line-leading em dash', '\u2014 first point', '- first point'],
    ['line-ending em dash', 'I paused \u2014\nthen called', 'I paused -\nthen called'],
    ['en dash range', '2\u20133 days', '2-3 days'],
    ['spaced en dash', 'better \u2013 mostly', 'better - mostly'],
    ['minus sign', 'BE \u22122', 'BE -2'],
    ['curly apostrophe', 'I\u2019m not sure', "I'm not sure"],
    ['curly double quotes', '\u201Cfairly happy\u201D', '"fairly happy"'],
    ['ellipsis', 'I wondered\u2026', 'I wondered...'],
    ['arrow', 'BP 180\u2192140', 'BP 180 -> 140'],
    ['bullet', '\u2022 Read NG28\n\u2022 Audit', '- Read NG28\n- Audit'],
  ])('normalises %s', (_name, input, expected) => {
    expect(normaliseTypography(input)).toBe(expected);
  });

  it('never joins lines', () => {
    expect(normaliseTypography('first \u2014\nsecond\n\nthird')).toBe('first -\nsecond\n\nthird');
  });

  it('keeps leading indentation', () => {
    expect(normaliseTypography('Plan:\n  \u2022 review')).toBe('Plan:\n  - review');
  });

  it('leaves clinical notation untouched', () => {
    const clinical = 'Gave 500 µg, BSA 1.8 m², T 38.5°C, eGFR ≥ 60, ±2, £12, café, 2×daily, 5′';
    expect(normaliseTypography(clinical)).toBe(clinical);
  });

  it('returns clean ASCII text unchanged', () => {
    const plain = 'I was fairly happy it was gout - and started colchicine.\n\n- Read NG28';
    expect(normaliseTypography(plain)).toBe(plain);
  });

  it('is idempotent', () => {
    const messy =
      '\u2022 I\u2019m sure\u2026 it\u2019s \u201Cgout\u201D \u2014 2\u20133 days \u2192 better\u202F ';
    const once = normaliseTypography(messy);
    expect(normaliseTypography(once)).toBe(once);
  });
});
