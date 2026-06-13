import {
  byTierDescending,
  formatCapabilityBlock,
  normaliseForMatch,
  quoteAppearsIn,
  tierAtLeast,
} from '../capability-grading.util';

describe('capability-grading.util', () => {
  describe('tierAtLeast', () => {
    it('treats undefined as below every threshold', () => {
      expect(tierAtLeast(undefined, 'adequate')).toBe(false);
      expect(tierAtLeast(undefined, 'missing')).toBe(false);
    });

    it('compares on the missing < shallow < adequate < strong ladder', () => {
      expect(tierAtLeast('strong', 'adequate')).toBe(true);
      expect(tierAtLeast('adequate', 'adequate')).toBe(true);
      expect(tierAtLeast('shallow', 'adequate')).toBe(false);
      expect(tierAtLeast('missing', 'adequate')).toBe(false);
    });
  });

  describe('byTierDescending', () => {
    it('orders strongest first and is stable within a tier', () => {
      const items = [
        { tier: 'shallow' as const, id: 'a' },
        { tier: 'strong' as const, id: 'b' },
        { tier: 'adequate' as const, id: 'c' },
        { tier: 'strong' as const, id: 'd' },
      ];
      expect([...items].sort(byTierDescending).map((i) => i.id)).toEqual(['b', 'd', 'c', 'a']);
    });
  });

  describe('normaliseForMatch / quoteAppearsIn', () => {
    it('tolerates casing and whitespace differences but not paraphrase', () => {
      const transcript = 'I  started\nmetformin and discussed lifestyle changes';
      expect(quoteAppearsIn(transcript, 'I started metformin')).toBe(true);
      expect(quoteAppearsIn(transcript, 'STARTED   METFORMIN')).toBe(true);
      expect(quoteAppearsIn(transcript, 'I prescribed metformin')).toBe(false);
    });

    it('rejects empty or whitespace-only quotes', () => {
      expect(quoteAppearsIn('anything', '')).toBe(false);
      expect(quoteAppearsIn('anything', '   ')).toBe(false);
      expect(quoteAppearsIn('anything', undefined)).toBe(false);
    });

    it('normaliseForMatch collapses whitespace and lowercases', () => {
      expect(normaliseForMatch('  Foo   Bar\n Baz ')).toBe('foo bar baz');
    });
  });

  describe('formatCapabilityBlock', () => {
    it('renders only the fields that are present', () => {
      const block = formatCapabilityBlock([
        { code: 'C-01', name: 'Data Gathering', domainName: 'Knowing yourself' },
      ]);
      expect(block).toBe('### C-01 — Data Gathering\nDomain: Knowing yourself');
    });

    it('includes criteria, exemplars and threaded evidence when supplied', () => {
      const block = formatCapabilityBlock([
        {
          code: 'C-06',
          name: 'Managing complexity',
          criteria: 'Strong = ...',
          exemplars: ['ex one', 'ex two'],
          foundQuote: 'I started metformin',
          foundReasoning: 'autonomous decision',
        },
      ]);
      expect(block).toContain('Descriptor criteria: Strong = ...');
      expect(block).toContain('Examples:\n- ex one\n- ex two');
      expect(block).toContain('Evidence already found: "I started metformin"');
      expect(block).toContain('Why it was tagged: autonomous decision');
    });
  });
});
