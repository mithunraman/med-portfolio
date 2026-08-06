import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CORPUS_DIR, CorpusValidationError, loadMessages, loadThreads } from '../corpus.loader';

/** Write a throwaway corpus directory so validation can be exercised on bad input. */
function fixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1-corpus-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body, 'utf8');
  dirs.push(dir);
  return dir;
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const VALID_MESSAGE = `
- id: msg-001
  mode: text
  intent: a valid case
  mustRedact:
    - { type: PERSON, value: Patel }
  mustSurvive: [NICE]
  text: |
    Saw Mrs Patel today and followed the NICE guidance.
`;

describe('G-1 corpus loader — the answer key must be true of its own text', () => {
  it('loads a well-formed message', () => {
    const [msg] = loadMessages(fixture({ 'messages.yaml': VALID_MESSAGE }));

    expect(msg.id).toBe('msg-001');
    expect(msg.mustRedact).toEqual([{ type: 'PERSON', value: 'Patel' }]);
  });

  it('rejects a planted identifier that is not in its own text', () => {
    // The defect this whole file exists for. A key that cannot appear in the
    // output scores as caught on every run, for ever — recall goes up and
    // nothing fails. Silent, and in the reassuring direction.
    const dir = fixture({
      'messages.yaml': `
- id: msg-001
  mode: text
  intent: typo in the answer key
  mustRedact:
    - { type: PERSON, value: Patell }
  mustSurvive: []
  text: |
    Saw Mrs Patel today.
`,
    });

    expect(() => loadMessages(dir)).toThrow(CorpusValidationError);
    expect(() => loadMessages(dir)).toThrow(/could never leak/);
  });

  it('rejects a must-survive term that is not in its own text', () => {
    // The mirror defect: reported as over-redacted on every run, which trains
    // the reader to ignore that column.
    const dir = fixture({
      'messages.yaml': `
- id: msg-001
  mode: text
  intent: term absent from prose
  mustRedact: []
  mustSurvive: [debrief]
  text: |
    We debriefed afterwards.
`,
    });

    expect(() => loadMessages(dir)).toThrow(/over-redacted on every run/);
  });

  it('rejects a planted identifier that collides with a must-survive term', () => {
    // The eponym case: `Parkinson` the patient in a message that also says
    // `Parkinson's` the condition. Redacting the name and keeping the condition
    // is exactly right, and still leaves "Parkinson" in the output — so the
    // identifier scores as leaked on every run. Wrong in the alarming direction
    // rather than the reassuring one, but no less wrong.
    const dir = fixture({
      'messages.yaml': `
- id: msg-001
  mode: text
  intent: eponym collision
  mustRedact:
    - { type: PERSON, value: Parkinson }
  mustSurvive: ["Parkinson's"]
  text: |
    Mr Parkinson has had Parkinson's for six years.
`,
    });

    expect(() => loadMessages(dir)).toThrow(/would score as leaked even when redaction is correct/);
  });

  it('accepts a longer key that excludes the surviving term', () => {
    expect(() =>
      loadMessages(
        fixture({
          'messages.yaml': `
- id: msg-001
  mode: text
  intent: eponym collision, resolved
  mustRedact:
    - { type: PERSON, value: Mr Parkinson }
  mustSurvive: ["Parkinson's"]
  text: |
    Mr Parkinson has had Parkinson's for six years.
`,
        })
      )
    ).not.toThrow();
  });

  it('rejects duplicate ids', () => {
    expect(() => loadMessages(fixture({ 'messages.yaml': VALID_MESSAGE + VALID_MESSAGE }))).toThrow(
      /duplicate id/
    );
  });

  it('rejects an unknown mode', () => {
    const dir = fixture({
      'messages.yaml': `
- id: msg-001
  mode: dictated
  intent: bad mode
  mustRedact: []
  mustSurvive: []
  text: |
    Some prose.
`,
    });

    expect(() => loadMessages(dir)).toThrow(/mode must be/);
  });

  it('rejects empty text', () => {
    const dir = fixture({
      'messages.yaml': `
- id: msg-001
  mode: text
  intent: empty
  mustRedact: []
  mustSurvive: []
  text: "  "
`,
    });

    expect(() => loadMessages(dir)).toThrow(/empty text/);
  });

  it('defaults omitted lists rather than leaving them undefined', () => {
    const [msg] = loadMessages(
      fixture({
        'messages.yaml': `
- id: msg-001
  mode: text
  intent: minimal
  text: |
    Nothing planted here.
`,
      })
    );

    expect(msg.mustRedact).toEqual([]);
    expect(msg.mustSurvive).toEqual([]);
  });

  it('reports every problem at once', () => {
    // Fixing a corpus one exception per run would be miserable, and the second
    // problem is usually the same mistake as the first.
    const dir = fixture({
      'messages.yaml': `
- id: msg-001
  mode: text
  intent: two problems
  mustRedact:
    - { type: PERSON, value: Nobody }
  mustSurvive: [Absent]
  text: |
    Some prose.
`,
    });

    try {
      loadMessages(dir);
      fail('expected CorpusValidationError');
    } catch (error) {
      expect((error as CorpusValidationError).problems).toHaveLength(2);
    }
  });

  it('rejects a non-list top-level document', () => {
    expect(() => loadMessages(fixture({ 'messages.yaml': 'id: msg-001\n' }))).toThrow(/top-level YAML list/);
  });
});

describe('G-1 corpus loader — threads', () => {
  const VALID_THREAD = `
- id: thread-01
  title: a valid thread
  accumulationMechanism: nothing in particular
  identifiabilityQuestion: Could you identify this person?
  mustRedact:
    - { type: PERSON, value: Aldenshaw }
  messages:
    - mode: text
      text: |
        First turn, no identifiers.
    - mode: voice
      text: |
        second turn mentions aldenshaw
`;

  it('loads a well-formed thread', () => {
    const [thread] = loadThreads(fixture({ 'threads.yaml': VALID_THREAD }));

    expect(thread.messages).toHaveLength(2);
  });

  it('checks a thread key against the concatenated turns, not one message', () => {
    // A thread's identifiers may sit in any turn, so per-message validation
    // would reject keys that are perfectly correct.
    expect(() => loadThreads(fixture({ 'threads.yaml': VALID_THREAD }))).not.toThrow();
  });

  it('rejects a thread with no identifiability question', () => {
    // A thread nobody is asked to judge measures nothing — it is the only
    // instrument G-1 has for quasi-identifiers.
    const dir = fixture({
      'threads.yaml': `
- id: thread-01
  title: unjudgeable
  accumulationMechanism: x
  messages:
    - mode: text
      text: |
        Some prose.
`,
    });

    expect(() => loadThreads(dir)).toThrow(/identifiabilityQuestion/);
  });

  it('rejects a thread with no messages', () => {
    const dir = fixture({
      'threads.yaml': `
- id: thread-01
  title: empty
  accumulationMechanism: x
  identifiabilityQuestion: Who is this?
  messages: []
`,
    });

    expect(() => loadThreads(dir)).toThrow(/no messages/);
  });
});

describe('G-1 corpus — the committed corpus itself', () => {
  // The highest-value assertion in this file: it holds the real 50 messages and
  // 8 threads to the same standard as the fixtures above, and fails the moment
  // someone edits prose without editing the answer key alongside it.
  it('loads and self-validates', () => {
    const messages = loadMessages(CORPUS_DIR);
    const threads = loadThreads(CORPUS_DIR);

    expect(messages).toHaveLength(50);
    expect(threads).toHaveLength(8);
    expect(messages.filter((m) => m.mode === 'voice').length).toBeGreaterThanOrEqual(8);
    expect(messages.reduce((n, m) => n + m.mustRedact.length, 0)).toBeGreaterThan(50);
  });
});
