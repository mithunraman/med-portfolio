import { CorpusMessage, Mode } from '../corpus.types';
import { aggregate, scoreMessage } from '../scorer';

function message(overrides: Partial<CorpusMessage> = {}): CorpusMessage {
  return {
    id: 'msg-test',
    mode: 'text',
    intent: 'test fixture',
    mustRedact: [],
    mustSurvive: [],
    text: '',
    ...overrides,
  };
}

describe('G-1 scorer — scoreMessage', () => {
  it('counts a redacted identifier as caught', () => {
    const score = scoreMessage(
      message({ mustRedact: [{ type: 'PERSON', value: 'Patel' }], text: 'Saw Mrs Patel today' }),
      'Saw Mrs [PERSON] today'
    );

    expect(score.leaked).toHaveLength(0);
    expect(score.caught).toEqual([{ type: 'PERSON', value: 'Patel' }]);
  });

  it('counts a surviving identifier as leaked', () => {
    const score = scoreMessage(
      message({ mustRedact: [{ type: 'PERSON', value: 'Patel' }], text: 'Saw Mrs Patel today' }),
      'Saw Mrs Patel today'
    );

    expect(score.leaked).toEqual([{ type: 'PERSON', value: 'Patel' }]);
    expect(score.caught).toHaveLength(0);
  });

  it('counts a partial survival as leaked', () => {
    // The identifying token reached the model. Anything softer here would
    // understate recall in a compliance document.
    const score = scoreMessage(
      message({ mustRedact: [{ type: 'PERSON', value: 'Patel' }] }),
      'Saw Mrs [PERSON] Patel today'
    );

    expect(score.leaked).toHaveLength(1);
  });

  it('counts an alias surviving as a leak', () => {
    // The pipeline can TRANSFORM an identifier: cleaning runs after both
    // redaction layers and rewrote a spoken NHS number into digits, downstream
    // of anything that could redact it. The spoken key stopped matching and the
    // scorer reported a pass over an identifier that had only changed shape.
    const score = scoreMessage(
      message({
        mustRedact: [
          { type: 'NHS_NUMBER', value: 'nine nine nine one three one six seven six zero', aliases: ['9991316760'] },
        ],
      }),
      'His NHS number is 999 131 6760.'
    );

    expect(score.leaked).toHaveLength(1);
  });

  it('counts an identifier as caught only when no form survives', () => {
    const score = scoreMessage(
      message({
        mustRedact: [
          { type: 'NHS_NUMBER', value: 'nine nine nine one three one six seven six zero', aliases: ['9991316760'] },
        ],
      }),
      'His NHS number is [NHS_NUMBER].'
    );

    expect(score.caught).toHaveLength(1);
  });

  it('scores structured identifiers regardless of the formatting in the output', () => {
    const score = scoreMessage(
      message({ mustRedact: [{ type: 'NHS_NUMBER', value: '999 100 0003' }] }),
      'the number 9991000003 is on file'
    );

    expect(score.leaked).toHaveLength(1);
  });

  it('records must-survive terms the pipeline removed', () => {
    const score = scoreMessage(
      message({ mustSurvive: ['NICE', 'metformin'] }),
      'added [ORGANISATION] guidance and metformin'
    );

    expect(score.overRedacted).toEqual(['NICE']);
  });

  it('carries the message mode through, since floors depend on it', () => {
    expect(scoreMessage(message({ mode: 'voice' }), '').mode).toBe('voice');
  });
});

describe('G-1 scorer — aggregate', () => {
  const scored = (
    id: string,
    mode: Mode,
    caught: [string, string][],
    leaked: [string, string][],
    overRedacted: string[] = []
  ) => ({
    id,
    mode,
    caught: caught.map(([type, value]) => ({ type, value })),
    leaked: leaked.map(([type, value]) => ({ type, value })),
    overRedacted,
  });

  it('computes recall per type and mode', () => {
    const result = aggregate([
      scored('a', 'text', [['PERSON', 'x']], [['PERSON', 'y']]),
      scored('b', 'text', [['PERSON', 'z']], []),
    ]);

    const person = result.byTypeAndMode.find((r) => r.type === 'PERSON' && r.mode === 'text');
    expect(person).toMatchObject({ planted: 3, leaked: 1 });
    expect(person?.recall).toBeCloseTo(2 / 3);
  });

  it('keeps text and voice in separate buckets', () => {
    // They are separate because their floors differ — a spoken postcode has no
    // deterministic pattern behind it. Merging them would hide the gap G-1 exists
    // to find.
    const result = aggregate([
      scored('a', 'text', [['POSTCODE', 'BA11 7XQ']], []),
      scored('b', 'voice', [], [['POSTCODE', 'B A eleven seven X Q']]),
    ]);

    expect(result.byTypeAndMode).toHaveLength(2);
    expect(result.byTypeAndMode.find((r) => r.mode === 'text')?.recall).toBe(1);
    expect(result.byTypeAndMode.find((r) => r.mode === 'voice')?.recall).toBe(0);
  });

  it('fails the verdict when any bucket falls below its floor', () => {
    // POSTCODE/text has a 100% floor — it is backed by a deterministic pattern,
    // so a single miss is a bug rather than model variance.
    const result = aggregate([
      scored('a', 'text', [], [['POSTCODE', 'BA11 7XQ']]),
      scored('b', 'text', [['PERSON', 'x']], []),
    ]);

    expect(result.verdict).toBe('FAIL');
    expect(result.byTypeAndMode.find((r) => r.type === 'POSTCODE')?.passes).toBe(false);
  });

  it('passes when every bucket clears its floor', () => {
    const result = aggregate([scored('a', 'text', [['PERSON', 'x']], [])]);
    expect(result.verdict).toBe('PASS');
  });

  it('applies the strict default floor to a type nobody anticipated', () => {
    const result = aggregate([scored('a', 'text', [], [['BIOMETRIC_ID', 'x']])]);

    expect(result.byTypeAndMode[0].floor).toBe(0.95);
    expect(result.verdict).toBe('FAIL');
  });

  it('lets an accepted residual pass while it holds its measured level', () => {
    // LOCATION/text is waived at 1/3, accepted 2026-08-05. The floor stays at
    // 95% — the waiver records the gap rather than hiding it in a lower number.
    const result = aggregate([
      scored('a', 'text', [['LOCATION', 'x']], [['LOCATION', 'y'], ['LOCATION', 'z']]),
    ]);

    const row = result.byTypeAndMode[0];
    expect(row.recall).toBeCloseTo(1 / 3);
    expect(row.floor).toBe(0.95);
    expect(row.waived?.acceptedOn).toBe('2026-08-05');
    expect(result.verdict).toBe('PASS');
  });

  it('fails again when a waived bucket degrades beyond one identifier', () => {
    // The whole point of freezing the measured value: a blanket waiver would let
    // LOCATION slide from 33% to 0% in silence.
    const result = aggregate([
      scored(
        'a',
        'text',
        [],
        [
          ['LOCATION', 'a'],
          ['LOCATION', 'b'],
          ['LOCATION', 'c'],
          ['LOCATION', 'd'],
          ['LOCATION', 'e'],
          ['LOCATION', 'f'],
        ]
      ),
    ]);

    expect(result.byTypeAndMode[0].recall).toBe(0);
    expect(result.verdict).toBe('FAIL');
  });

  it('does not mark a waived bucket as waived once it recovers above its floor', () => {
    // A recovered waiver must go inert rather than mask the improvement —
    // otherwise it could never safely be removed.
    const result = aggregate([
      scored('a', 'text', [['LOCATION', 'x'], ['LOCATION', 'y'], ['LOCATION', 'z']], []),
    ]);

    expect(result.byTypeAndMode[0].waived).toBeUndefined();
    expect(result.byTypeAndMode[0].passes).toBe(true);
  });

  it('still fails an unwaived bucket below floor', () => {
    const result = aggregate([scored('a', 'text', [], [['POSTCODE', 'BA11 7XQ']])]);

    expect(result.byTypeAndMode[0].waived).toBeUndefined();
    expect(result.verdict).toBe('FAIL');
  });

  it('emits no row for a type with nothing planted, rather than 0/0', () => {
    // A fabricated row would read as either a failure or a pass that was never
    // measured. Both are worse than an absent row.
    const result = aggregate([scored('a', 'text', [], [], ['NICE'])]);

    expect(result.byTypeAndMode).toHaveLength(0);
    expect(result.totalPlanted).toBe(0);
    expect(result.verdict).toBe('PASS');
  });

  it('tallies over-redaction across the corpus without gating on it', () => {
    // Over-redaction is product quality, not a privacy risk. Gating on it would
    // create pressure to weaken redaction.
    const result = aggregate([
      scored('a', 'text', [['PERSON', 'x']], [], ['NICE', '111']),
      scored('b', 'text', [['PERSON', 'y']], [], ['NICE']),
    ]);

    expect(result.overRedaction).toEqual([
      { term: 'NICE', lost: 2 },
      { term: '111', lost: 1 },
    ]);
    expect(result.verdict).toBe('PASS');
  });

  it('sorts worst recall first, so the report leads with what needs attention', () => {
    const result = aggregate([
      scored('a', 'text', [['PERSON', 'x']], []),
      scored('b', 'text', [], [['LOCATION', 'y']]),
    ]);

    expect(result.byTypeAndMode[0].type).toBe('LOCATION');
  });

  it('totals planted and leaked across every bucket', () => {
    const result = aggregate([
      scored('a', 'text', [['PERSON', 'x']], [['PERSON', 'y']]),
      scored('b', 'voice', [], [['LOCATION', 'z']]),
    ]);

    expect(result.totalPlanted).toBe(3);
    expect(result.totalLeaked).toBe(2);
  });
});
