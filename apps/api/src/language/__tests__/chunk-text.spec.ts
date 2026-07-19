import { chunkText } from '../chunk-text';

describe('chunkText', () => {
  it('returns an empty array for empty input', () => {
    expect(chunkText('', 100)).toEqual([]);
  });

  it('returns a single chunk when the text fits within the limit', () => {
    expect(chunkText('short text', 100)).toEqual(['short text']);
  });

  it('throws when maxChars is not positive', () => {
    expect(() => chunkText('abc', 0)).toThrow(/maxChars must be positive/);
    expect(() => chunkText('abc', -5)).toThrow(/maxChars must be positive/);
  });

  it('splits long text without exceeding the limit and loses nothing', () => {
    const sentence = 'The patient was reviewed on the ward this morning. ';
    const text = sentence.repeat(40); // ~2000 chars
    const chunks = chunkText(text, 200);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
    // Reassembly is byte-for-byte identical — the core no-loss invariant.
    expect(chunks.join('')).toBe(text);
  });

  it('prefers sentence/word boundaries over cutting mid-word', () => {
    const text = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet';
    const chunks = chunkText(text, 20);

    expect(chunks.join('')).toBe(text);
    // No chunk should end in the middle of a word (except a forced hard split).
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.endsWith(' ')).toBe(true);
    }
  });

  it('hard-splits a single token with no boundaries', () => {
    const text = 'x'.repeat(500);
    const chunks = chunkText(text, 100);

    expect(chunks).toHaveLength(5);
    expect(chunks.every((c) => c.length === 100)).toBe(true);
    expect(chunks.join('')).toBe(text);
  });
});
