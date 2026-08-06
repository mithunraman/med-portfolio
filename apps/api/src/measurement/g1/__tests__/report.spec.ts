import { CorpusMessage, CorpusThread } from '../corpus.types';
import { MessageRun, renderReport, ThreadRun } from '../report';
import { aggregate, scoreMessage } from '../scorer';

function message(overrides: Partial<CorpusMessage> = {}): CorpusMessage {
  return {
    id: 'msg-001',
    mode: 'text',
    intent: 'fixture',
    mustRedact: [],
    mustSurvive: [],
    text: '',
    ...overrides,
  };
}

/** Build a MessageRun as the harness would, but from fixed strings. */
function run(msg: CorpusMessage, redactedText: string, cleanedText = redactedText): MessageRun {
  return {
    message: msg,
    redactedText,
    cleanedText,
    injectionDetected: false,
    redactionScore: scoreMessage(msg, redactedText),
    finalScore: scoreMessage(msg, cleanedText),
  };
}

function render(runs: MessageRun[], threads: ThreadRun[] = []): string {
  return renderReport({
    runDate: '2026-08-05',
    corpusDir: 'docs/compliance/measurements/corpus',
    azureSdkVersion: '^1.1.0',
    messages: runs,
    threads,
    score: aggregate(runs.map((r) => r.finalScore)),
  });
}

describe('G-1 report', () => {
  it('leads with the verdict and the headline counts', () => {
    const out = render([
      run(message({ mustRedact: [{ type: 'PERSON', value: 'Patel' }] }), 'Saw Mrs [PERSON] today'),
    ]);

    expect(out).toContain('✅ PASS');
    expect(out).toContain('| Identifiers planted | 1 |');
    expect(out).toContain('| Identifiers leaked | **0** |');
  });

  it('marks a bucket below its floor', () => {
    const out = render([
      run(message({ mustRedact: [{ type: 'POSTCODE', value: 'BA11 7XQ' }] }), 'lives at BA11 7XQ'),
    ]);

    expect(out).toContain('❌ FAIL');
    expect(out).toContain('below floor');
  });

  it('records the SDK version, so a later regression is attributable', () => {
    // Azure's model can change under a pinned SDK. A number with no version
    // beside it cannot be compared to the next one.
    expect(render([])).toContain('@azure/ai-language-text@^1.1.0');
  });

  it('shows each leak in context rather than only counting it', () => {
    // A count says something failed. The surrounding text says whether it is a
    // model miss, a carve-out working as designed, or a corpus mistake — and
    // those need different responses.
    const out = render([
      run(
        message({ intent: 'name survives', mustRedact: [{ type: 'PERSON', value: 'Patel' }] }),
        'Reviewed Mrs Patel this morning at the surgery about her knee'
      ),
    ]);

    expect(out).toContain('**PERSON** `Patel`');
    expect(out).toContain('Reviewed Mrs Patel this morning');
    expect(out).toContain('name survives');
  });

  it('flags a material voice-vs-typed gap instead of averaging it away', () => {
    const out = render([
      run(message({ id: 'a', mustRedact: [{ type: 'PERSON', value: 'Patel' }] }), 'Mrs [PERSON] today'),
      run(
        message({ id: 'b', mode: 'voice', mustRedact: [{ type: 'PERSON', value: 'Deveraux' }] }),
        'um mrs deveraux came in'
      ),
    ]);

    expect(out).toContain('## Voice vs typed');
    expect(out).toContain('Transcription noise is costing recall');
  });

  it('reports when cleaning changed the leak count', () => {
    // Cleaning is an LLM and the last writer to `content`. Its placeholder guard
    // is a claim until something measures it.
    const out = render([
      run(
        message({ mustRedact: [{ type: 'PERSON', value: 'Patel' }] }),
        'Saw Mrs [PERSON] today',
        'Saw Mrs Patel today'
      ),
    ]);

    expect(out).toContain('## Redaction vs cleaning');
    expect(out).toMatch(/\| msg-001 \| 0 \| 1 \|/);
  });

  it('calls out a prompt-injection flag on ordinary clinical prose', () => {
    // In production these are marked REJECTED and the entry is lost, so a false
    // positive here is a product defect, not a curiosity.
    const flagged = { ...run(message(), 'clean prose'), injectionDetected: true };

    expect(render([flagged])).toContain('flagged as prompt injection');
  });

  it('tallies over-redaction while stating that it is not gated', () => {
    const out = render([run(message({ mustSurvive: ['NICE'] }), 'per the [ORGANISATION] guidance')]);

    expect(out).toContain('## Over-redaction');
    expect(out).toContain('**Reported, not gated.**');
    expect(out).toContain('| `NICE` | 1 |');
    expect(out).toContain('✅ PASS');
  });

  it('prints threads with their question, mechanism and transcript', () => {
    // Threads are the only instrument G-1 has for quasi-identifiers, and they
    // only work if a human reads them.
    const thread: CorpusThread = {
      id: 'thread-01',
      title: 'Rural paediatric',
      accumulationMechanism: 'every carve-out fires legitimately',
      identifiabilityQuestion: 'Could you name this child?',
      mustRedact: [],
      messages: [{ mode: 'text', text: 'x' }],
    };

    const out = render([], [{ thread, redactedMessages: ['x'], transcript: 'TRAINEE:\nx', leaked: [] }]);

    expect(out).toContain('# Part B — quasi-identifier read (human)');
    expect(out).toContain('Could you name this child?');
    expect(out).toContain('every carve-out fires legitimately');
    expect(out).toContain('TRAINEE:\nx');
    expect(out).toContain('**Answer:** _(to be completed by the reader)_');
  });

  it('flags conventional identifiers that leaked inside a thread', () => {
    const thread: CorpusThread = {
      id: 'thread-04',
      title: 'Public event',
      accumulationMechanism: 'x',
      identifiabilityQuestion: 'Identifiable?',
      mustRedact: [{ type: 'LOCATION', value: 'A303' }],
      messages: [{ mode: 'text', text: 'the A303 collision' }],
    };

    const out = render(
      [],
      [
        {
          thread,
          redactedMessages: ['the A303 collision'],
          transcript: 'TRAINEE:\nthe A303 collision',
          leaked: [{ type: 'LOCATION', value: 'A303' }],
        },
      ]
    );

    expect(out).toContain('Conventional identifiers that also leaked');
    expect(out).toContain('`LOCATION: A303`');
  });

  it('renders an empty run without inventing rows', () => {
    const out = render([]);

    expect(out).toContain('_No identifiers planted._');
    expect(out).not.toContain('## Voice vs typed');
  });
});
