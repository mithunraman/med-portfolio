import type { ConfigService } from '@nestjs/config';
import {
  AzureLanguageService,
  isAbsoluteDate,
  isNationalBody,
  mergeOverlaps,
  parseWordedAge,
  shouldRedactEntity,
} from '../azure-language.service';
import type { RedactionPolicy } from '../azure-language.service';

/** Minimal ConfigService stub over a key→value map. */
function configStub(values: Record<string, unknown>): ConfigService {
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

const VALID_CONFIG = {
  'app.azureLanguage.endpoint': 'https://logdit-pii-uk.cognitiveservices.azure.com',
  'app.azureLanguage.tenantId': 'tenant-id',
  'app.azureLanguage.clientId': 'client-id',
  'app.azureLanguage.clientSecret': 'client-secret',
};

/** Shape of one Azure entity, matching the SDK's `Entity`. */
interface FakeEntity {
  text: string;
  category: string;
  subCategory?: string;
  offset: number;
  length: number;
  confidenceScore: number;
}

/**
 * Build a service whose Azure client is replaced by a fake `analyze`. The real
 * constructor still runs (credential + client construction), exercising the
 * config-guard path, but no network call is ever made.
 */
function buildService(
  analyze: jest.Mock,
  config: Record<string, unknown> = VALID_CONFIG
): AzureLanguageService {
  const service = new AzureLanguageService(configStub(config));
  (service as unknown as { client: { analyze: jest.Mock } }).client = { analyze };
  return service;
}

/** A fake `analyze` that echoes each document with the given entities. */
function fakeAnalyze(entitiesPerDoc: (text: string) => FakeEntity[]): jest.Mock {
  return jest.fn(async (_action: string, documents: { id: string; text: string }[]) =>
    documents.map((doc) => ({
      id: doc.id,
      entities: entitiesPerDoc(doc.text),
      redactedText: doc.text,
    }))
  );
}

describe('AzureLanguageService', () => {
  describe('constructor guard', () => {
    it('throws when any Entra credential is missing', () => {
      expect(() => new AzureLanguageService(configStub({}))).toThrow(
        /missing required config/
      );
      expect(
        () =>
          new AzureLanguageService(
            configStub({ ...VALID_CONFIG, 'app.azureLanguage.clientSecret': undefined })
          )
      ).toThrow(/AZURE_CLIENT_SECRET/);
    });
  });

  describe('redactPhi', () => {
    it('replaces a detected entity with a typed placeholder', async () => {
      const text = 'Reviewed by Dr Okafor today.';
      const analyze = fakeAnalyze((t) =>
        t.includes('Okafor')
          ? [{ text: 'Okafor', category: 'Person', offset: t.indexOf('Okafor'), length: 6, confidenceScore: 0.99 }]
          : []
      );
      const service = buildService(analyze);

      const result = await service.redactPhi(text);

      expect(result.redactedText).toBe('Reviewed by Dr [PERSON] today.');
      expect(result.entities).toEqual([{ category: 'Person', confidenceScore: 0.99 }]);
    });

    it('converts PascalCase categories to snake-case placeholders', async () => {
      const text = 'Call 07700900123 now';
      const analyze = fakeAnalyze(() => [
        { text: '07700900123', category: 'PhoneNumber', offset: 5, length: 11, confidenceScore: 0.9 },
      ]);
      const service = buildService(analyze);

      const result = await service.redactPhi(text);

      expect(result.redactedText).toBe('Call [PHONE_NUMBER] now');
    });

    it('masks multiple entities in one document without corrupting offsets', async () => {
      const text = 'Mrs Patel, born 1980, seen by Dr Khan';
      const analyze = fakeAnalyze(() => [
        { text: 'Patel', category: 'Person', offset: 4, length: 5, confidenceScore: 0.9 },
        { text: '1980', category: 'DateTime', offset: 16, length: 4, confidenceScore: 0.8 },
        { text: 'Khan', category: 'Person', offset: 33, length: 4, confidenceScore: 0.95 },
      ]);
      const service = buildService(analyze);

      const result = await service.redactPhi(text);

      expect(result.redactedText).toBe('Mrs [PERSON], born [DATE_TIME], seen by Dr [PERSON]');
      expect(result.entities).toHaveLength(3);
    });

    it('short-circuits on blank input without calling Azure', async () => {
      const analyze = fakeAnalyze(() => []);
      const service = buildService(analyze);

      const result = await service.redactPhi('   ');

      expect(result).toEqual({ redactedText: '   ', entities: [] });
      expect(analyze).not.toHaveBeenCalled();
    });

    it('chunks and batches long input, reassembling losslessly', async () => {
      // ~13k chars → 3 chunks of ≤5,120; one request (≤5 docs).
      const sentence = 'The patient was reviewed on the ward this morning. ';
      const text = sentence.repeat(260);
      const analyze = fakeAnalyze(() => []); // no entities → pure echo
      const service = buildService(analyze);

      const result = await service.redactPhi(text);

      expect(result.redactedText).toBe(text); // nothing lost across chunk seams
      expect(analyze).toHaveBeenCalledTimes(1);
      const [, documents] = analyze.mock.calls[0];
      expect(documents.length).toBeGreaterThan(1);
      expect(documents.every((d: { text: string }) => d.text.length <= 5120)).toBe(true);
    });

    it('splits into multiple requests when there are more than 5 chunks', async () => {
      const sentence = 'The patient was reviewed on the ward this morning. ';
      const text = sentence.repeat(700); // ~35k chars → 7 chunks → 2 requests
      const analyze = fakeAnalyze(() => []);
      const service = buildService(analyze);

      const result = await service.redactPhi(text);

      expect(result.redactedText).toBe(text);
      expect(analyze).toHaveBeenCalledTimes(2);
    });

    it('FAILS CLOSED: throws when Azure returns a document error', async () => {
      const analyze = jest.fn(async (_a: string, documents: { id: string }[]) =>
        documents.map((doc) => ({ id: doc.id, error: { message: 'boom' } }))
      );
      const service = buildService(analyze);

      await expect(service.redactPhi('Some clinical text')).rejects.toThrow(
        /Azure PHI redaction failed/
      );
    });

    it('FAILS CLOSED: throws when Azure rejects (non-retryable auth error)', async () => {
      const analyze = jest.fn(async () => {
        throw new Error('401 Unauthorized');
      });
      const service = buildService(analyze);

      await expect(service.redactPhi('Some clinical text')).rejects.toThrow(/401/);
      expect(analyze).toHaveBeenCalledTimes(1); // not retried
    });

    it('FAILS CLOSED: throws when Azure omits a document result (no silent hole)', async () => {
      // ~13k chars → 3 chunks in one request; Azure returns results for only two
      // of them. The missing chunk must fail hard — never vanish via join('').
      const sentence = 'The patient was reviewed on the ward this morning. ';
      const text = sentence.repeat(260);
      const analyze = jest.fn(async (_a: string, documents: { id: string; text: string }[]) =>
        documents
          .filter((doc) => doc.id !== '1') // drop the middle document's result
          .map((doc) => ({ id: doc.id, entities: [], redactedText: doc.text }))
      );
      const service = buildService(analyze);

      await expect(service.redactPhi(text)).rejects.toThrow(/no result for document 1/);
    });

    it('FAILS CLOSED: throws on an unexpected/malformed document id', async () => {
      // A non-numeric id → Number(id) is NaN; assigning at that key would leave
      // the real chunk a hole. Reject instead of silently misattributing.
      const analyze = jest.fn(async (_a: string, documents: { id: string; text: string }[]) =>
        documents.map((doc) => ({ id: `x${doc.id}`, entities: [], redactedText: doc.text }))
      );
      const service = buildService(analyze);

      await expect(service.redactPhi('Some clinical text')).rejects.toThrow(
        /unexpected document id/
      );
    });
  });

  describe('DateTime policy (Problem 3: preserve relative temporal narrative)', () => {
    // Reproduces the live message-2 case: a name + a relative "today" + an
    // absolute DOB, all returned by Azure as separate entities.
    const INPUT = 'I reviewed John Smith today, DOB 12/05/1980.';
    const analyzeFor = () =>
      fakeAnalyze((text) => [
        {
          text: 'John Smith',
          category: 'Person',
          offset: text.indexOf('John Smith'),
          length: 'John Smith'.length,
          confidenceScore: 0.99,
        },
        {
          text: 'today',
          category: 'DateTime',
          offset: text.indexOf('today'),
          length: 'today'.length,
          confidenceScore: 0.9,
        },
        {
          text: '12/05/1980',
          category: 'DateTime',
          offset: text.indexOf('12/05/1980'),
          length: '12/05/1980'.length,
          confidenceScore: 0.9,
        },
      ]);

    it('keep-relative (default): keeps "today", redacts the name and absolute DOB', async () => {
      const service = buildService(analyzeFor());

      const result = await service.redactPhi(INPUT);

      expect(result.redactedText).toContain('today'); // relative narrative preserved
      expect(result.redactedText).not.toContain('John Smith');
      expect(result.redactedText).not.toContain('12/05/1980'); // absolute date removed
      // Metadata reports only what was actually redacted — the kept date is excluded.
      expect(result.entities.filter((e) => e.category === 'DateTime')).toHaveLength(1);
    });

    it('redact-all: also removes "today"', async () => {
      const service = buildService(analyzeFor(), {
        ...VALID_CONFIG,
        'app.azureLanguage.datePolicy': 'redact-all',
      });

      const result = await service.redactPhi(INPUT);

      expect(result.redactedText).not.toContain('today');
      expect(result.entities.filter((e) => e.category === 'DateTime')).toHaveLength(2);
    });
  });

  describe('PersonType policy (keep job roles / relationship nouns)', () => {
    const INPUT = 'Discussed with my supervisor, Dr James Okafor.';
    const analyzeFor = () =>
      fakeAnalyze((text) => [
        {
          text: 'supervisor',
          category: 'PersonType',
          offset: text.indexOf('supervisor'),
          length: 'supervisor'.length,
          confidenceScore: 0.95,
        },
        {
          text: 'James Okafor',
          category: 'Person',
          offset: text.indexOf('James Okafor'),
          length: 'James Okafor'.length,
          confidenceScore: 0.99,
        },
      ]);

    it('keeps "supervisor" (default) but still redacts the real name', async () => {
      const service = buildService(analyzeFor());

      const result = await service.redactPhi(INPUT);

      expect(result.redactedText).toContain('supervisor'); // role word preserved
      expect(result.redactedText).not.toContain('James Okafor');
      expect(result.redactedText).toContain('[PERSON]');
      // Kept role is excluded from the reported redactions.
      expect(result.entities.some((e) => e.category === 'PersonType')).toBe(false);
    });

    it('redacts "supervisor" when keepPersonType is false', async () => {
      const service = buildService(analyzeFor(), {
        ...VALID_CONFIG,
        'app.azureLanguage.keepPersonType': false,
      });

      const result = await service.redactPhi(INPUT);

      expect(result.redactedText).not.toContain('supervisor');
      expect(result.redactedText).toContain('[PERSON_TYPE]');
    });
  });

  describe('age policy (HIPAA: keep under 90, redact 90+)', () => {
    const analyzeForAge = (ageText: string) =>
      fakeAnalyze((text) => [
        {
          text: ageText,
          category: 'Quantity',
          subCategory: 'Age',
          offset: text.indexOf(ageText),
          length: ageText.length,
          confidenceScore: 0.9,
        },
      ]);

    it('keeps a non-identifying age under 90', async () => {
      const service = buildService(analyzeForAge('82-year-old'));

      const result = await service.redactPhi('An 82-year-old man was reviewed.');

      expect(result.redactedText).toBe('An 82-year-old man was reviewed.');
      expect(result.entities).toHaveLength(0); // kept → excluded from redactions
    });

    it('aggregates an identifying age of 90 or over to "90 or older" (HIPAA bucket)', async () => {
      // The exact age is replaced by the aggregate, not deleted, so the clinical
      // fact of advanced age survives: "The patient is 94." → "... is 90 or older."
      const service = buildService(analyzeForAge('94'));

      const result = await service.redactPhi('The patient is 94.');

      expect(result.redactedText).toBe('The patient is 90 or older.');
    });

    it('masks a non-age Quantity as [QUANTITY], not the age bucket', async () => {
      const service = buildService(
        fakeAnalyze((text) => [
          {
            text: '500',
            category: 'Quantity',
            offset: text.indexOf('500'),
            length: 3,
            confidenceScore: 0.9,
          },
        ])
      );

      const result = await service.redactPhi('The prize was 500 in total.');

      expect(result.redactedText).toBe('The prize was [QUANTITY] in total.');
    });

    it('keeps a spelled-out age under 90 verbatim (parsed, not over-redacted)', async () => {
      const service = buildService(analyzeForAge('eighty-two-year-old'));

      const result = await service.redactPhi('An eighty-two-year-old man was reviewed.');

      expect(result.redactedText).toBe('An eighty-two-year-old man was reviewed.');
      expect(result.entities).toHaveLength(0);
    });

    it('aggregates a spelled-out age of 90 or over to "90 or older"', async () => {
      const service = buildService(analyzeForAge('ninety-four-year-old'));

      const result = await service.redactPhi('A ninety-four-year-old woman was reviewed.');

      expect(result.redactedText).toBe('A 90 or older woman was reviewed.');
    });

    it('masks an unparseable age as typed [AGE], never a false "90 or older"', async () => {
      // The critical regression guard: an age we cannot read must be withheld
      // (as a typed [AGE], not the vaguer [QUANTITY]), not asserted into a band.
      const service = buildService(analyzeForAge('geriatric'));

      const result = await service.redactPhi('A geriatric patient was reviewed.');

      expect(result.redactedText).toBe('A [AGE] patient was reviewed.');
    });

    it('aggregates a worded centenarian to "90 or older" (not the vaguer [AGE])', async () => {
      const service = buildService(analyzeForAge('a hundred and three'));

      const result = await service.redactPhi('The patient is a hundred and three.');

      expect(result.redactedText).toBe('The patient is 90 or older.');
    });

    it('does NOT assert "90 or older" for an impossible age ("eighty fifteen")', async () => {
      // "eighty fifteen" would sum to 95 without the tens+teen guard — must fall to
      // [AGE], never a fabricated band.
      const service = buildService(analyzeForAge('eighty fifteen'));

      const result = await service.redactPhi('The patient is eighty fifteen.');

      expect(result.redactedText).toBe('The patient is [AGE].');
    });
  });

  describe('national bodies (Problem 4: keep NHS/NICE, redact the actual site)', () => {
    it('keeps enumerated national bodies but still redacts a specific hospital', async () => {
      const INPUT = 'Reviewed NICE guidance; treated at St Mary’s Hospital, flagged to the GMC.';
      // Azure tags all three as Organization (as observed in the live probe).
      const analyze = fakeAnalyze((text) => [
        {
          text: 'NICE',
          category: 'Organization',
          offset: text.indexOf('NICE'),
          length: 'NICE'.length,
          confidenceScore: 0.9,
        },
        {
          text: 'St Mary’s Hospital',
          category: 'Organization',
          offset: text.indexOf('St Mary’s Hospital'),
          length: 'St Mary’s Hospital'.length,
          confidenceScore: 0.9,
        },
        {
          text: 'GMC',
          category: 'Organization',
          offset: text.indexOf('GMC'),
          length: 'GMC'.length,
          confidenceScore: 0.9,
        },
      ]);
      const service = buildService(analyze);

      const result = await service.redactPhi(INPUT);

      expect(result.redactedText).toContain('NICE'); // national body kept
      expect(result.redactedText).toContain('the GMC'); // national body kept
      expect(result.redactedText).not.toContain('St Mary’s Hospital'); // real site redacted
      expect(result.redactedText).toContain('[ORGANIZATION]');
    });

    it('keeps a compound reference name ("NICE CKS") but redacts the specific practice', async () => {
      // The live over-redaction: Azure tags "NICE CKS" as ONE Organization span,
      // which the exact allow-list missed → the guideline reference became
      // "[ORGANIZATION]" in the trainee's saved PDP. The suffix-aware match keeps it.
      const INPUT = 'Review the NICE CKS guidance; patient seen at Springfield Medical Practice.';
      const analyze = fakeAnalyze((text) => [
        {
          text: 'NICE CKS',
          category: 'Organization',
          offset: text.indexOf('NICE CKS'),
          length: 'NICE CKS'.length,
          confidenceScore: 0.9,
        },
        {
          text: 'Springfield Medical Practice',
          category: 'Organization',
          offset: text.indexOf('Springfield Medical Practice'),
          length: 'Springfield Medical Practice'.length,
          confidenceScore: 0.9,
        },
      ]);
      const service = buildService(analyze);

      const result = await service.redactPhi(INPUT);

      expect(result.redactedText).toContain('NICE CKS'); // reference source kept
      expect(result.redactedText).not.toContain('Springfield Medical Practice'); // real site redacted
      expect(result.redactedText).toContain('[ORGANIZATION]');
    });
  });

  describe('overlapping entities (Problem 1: no corrupted placeholders)', () => {
    it('masks an NI number tagged by two overlapping categories as ONE clean placeholder', async () => {
      const INPUT = 'NI number AB123456C on file';
      // Azure returns the same span twice (the real failure): UK + EU national id.
      const analyze = fakeAnalyze((text) => [
        {
          text: 'AB123456C',
          category: 'UKNationalInsuranceNumber',
          offset: text.indexOf('AB123456C'),
          length: 'AB123456C'.length,
          confidenceScore: 0.95, // higher → wins the label
        },
        {
          text: 'AB123456C',
          category: 'EUNationalIdentificationNumber',
          offset: text.indexOf('AB123456C'),
          length: 'AB123456C'.length,
          confidenceScore: 0.85,
        },
      ]);
      const service = buildService(analyze);

      const result = await service.redactPhi(INPUT);

      // Exactly one clean placeholder — the old code produced the mangled
      // "[EUNATIONAL_IDENTIFICATION_NUMBER]AL_INSURANCE_NUMBER]" here.
      expect(result.redactedText).toBe('NI number [UKNATIONAL_INSURANCE_NUMBER] on file');
      expect(result.redactedText).not.toContain('AB123456C');
    });
  });
});

describe('date classifier', () => {
  describe('isAbsoluteDate', () => {
    it.each(['12/05/1980', '12-05-80', 'March 2026', '14 March', '1985', 'on 5 Nov'])(
      'treats "%s" as absolute',
      (text) => expect(isAbsoluteDate(text)).toBe(true)
    );

    it.each(['today', 'yesterday', 'three weeks ago', 'last Tuesday', 'at the end of the shift'])(
      'treats "%s" as relative',
      (text) => expect(isAbsoluteDate(text)).toBe(false)
    );
  });

  describe('shouldRedactEntity', () => {
    const keep: RedactionPolicy = { datePolicy: 'keep-relative', keepPersonType: true };
    const strict: RedactionPolicy = { datePolicy: 'redact-all', keepPersonType: false };

    it('keeps a relative DateTime under keep-relative', () => {
      expect(shouldRedactEntity('DateTime', 'today', keep)).toBe(false);
    });
    it('redacts an absolute DateTime under keep-relative', () => {
      expect(shouldRedactEntity('DateTime', '12/05/1980', keep)).toBe(true);
    });
    it('redacts any DateTime under redact-all', () => {
      expect(shouldRedactEntity('DateTime', 'today', strict)).toBe(true);
    });
    it('keeps PersonType when keepPersonType is true', () => {
      expect(shouldRedactEntity('PersonType', 'supervisor', keep)).toBe(false);
    });
    it('redacts PersonType when keepPersonType is false', () => {
      expect(shouldRedactEntity('PersonType', 'supervisor', strict)).toBe(true);
    });
    it('always redacts a real name (Person) regardless of policy', () => {
      expect(shouldRedactEntity('Person', 'James Okafor', keep)).toBe(true);
    });

    it('keeps an enumerated national body but redacts a specific institution', () => {
      expect(shouldRedactEntity('Organization', 'NICE', keep)).toBe(false);
      expect(shouldRedactEntity('Organization', "St Mary's Hospital", keep)).toBe(true);
    });

    it('keeps an age under 90 (HIPAA: only 90+ is identifying)', () => {
      // Detected via the Age subcategory…
      expect(shouldRedactEntity('Quantity', '82', keep, 'Age')).toBe(false);
      // …and via age-like phrasing when the subcategory is absent.
      expect(shouldRedactEntity('Quantity', '82-year-old', keep)).toBe(false);
      expect(shouldRedactEntity('Quantity', '89 years', keep)).toBe(false);
    });

    it('redacts an age of 90 or over (the HIPAA ceiling)', () => {
      expect(shouldRedactEntity('Quantity', '90', keep, 'Age')).toBe(true);
      expect(shouldRedactEntity('Quantity', '102-year-old', keep)).toBe(true);
    });

    it('parses a spelled-out age and applies the same ceiling', () => {
      expect(shouldRedactEntity('Quantity', 'eighty-two-year-old', keep, 'Age')).toBe(false); // 82
      expect(shouldRedactEntity('Quantity', 'ninety-two years old', keep, 'Age')).toBe(true); // 92
    });

    it('redacts an age it cannot parse at all (fail-closed)', () => {
      expect(shouldRedactEntity('Quantity', 'geriatric', keep, 'Age')).toBe(true);
    });

    it('does not treat a non-age Quantity as an age (falls through to redact)', () => {
      // No Age subcategory and no age phrasing → default behaviour, unchanged.
      expect(shouldRedactEntity('Quantity', '£4,500', keep)).toBe(true);
    });
  });

  describe('isNationalBody (deny-by-default allow-list)', () => {
    // Kept: an enumerated body, or an enumerated body wearing a reference-material
    // suffix ("NICE CKS", "NICE NG28", "RCGP guidance") — a reference source, not
    // an identifier.
    it.each([
      'NICE',
      'the NHS',
      'NICE CKS',
      'NICE guidance',
      'NICE NG28',
      'nice ng28',
      'BNF',
      'British National Formulary',
      'Cochrane',
      'SIGN 153',
      'Royal College of Physicians guidance',
    ])('keeps national reference source: %s', (name) => {
      expect(isNationalBody(name)).toBe(true);
    });

    // Redacted: a patient's specific institution never matches — it strips no
    // suffix, so its head is not enumerated. Guards against over-keeping,
    // especially the "NHS <place>" shape a prefix-match would have broken.
    it.each([
      'Leeds NHS Trust',
      'NHS Lothian',
      'Springfield Medical Practice',
      "St Mary's Hospital",
      'Acme Care Home',
    ])('still redacts a specific institution: %s', (name) => {
      expect(isNationalBody(name)).toBe(false);
    });
  });
});

describe('parseWordedAge', () => {
  it('parses tens+units, tens-only, and units-only', () => {
    expect(parseWordedAge('eighty-two')).toBe(82);
    expect(parseWordedAge('eighty two')).toBe(82); // space separator
    expect(parseWordedAge('ninety-four')).toBe(94);
    expect(parseWordedAge('forty')).toBe(40);
    expect(parseWordedAge('fifteen')).toBe(15);
    expect(parseWordedAge('seven')).toBe(7);
  });

  it('reads the number out of a whole age span, ignoring non-number words', () => {
    expect(parseWordedAge('eighty-two-year-old')).toBe(82);
    expect(parseWordedAge('aged ninety')).toBe(90);
  });

  it('parses across a Unicode dash (en-dash), not just ASCII hyphen', () => {
    expect(parseWordedAge('eighty–two')).toBe(82); // en-dash
    expect(parseWordedAge('ninety—four')).toBe(94); // em-dash
  });

  it('resolves a centenarian ("hundred") age to 100 so it aggregates to 90+', () => {
    expect(parseWordedAge('a hundred and three')).toBe(100);
    expect(parseWordedAge('one hundred')).toBe(100);
  });

  it('returns null for anything it cannot safely read (caller fails closed)', () => {
    expect(parseWordedAge('geriatric')).toBeNull();
    expect(parseWordedAge('two thousand')).toBeNull(); // magnitude, not an age
    expect(parseWordedAge('eighty ninety')).toBeNull(); // two tens
    expect(parseWordedAge('one two')).toBeNull(); // two units
    expect(parseWordedAge('eighty fifteen')).toBeNull(); // tens + teen — impossible
    expect(parseWordedAge('')).toBeNull();
  });
});

describe('isNationalBody', () => {
  it.each([
    'NHS',
    'National Health Service',
    'NHS England',
    'NICE',
    'the NICE', // leading "the" tolerated
    'GMC',
    'gphc', // case-insensitive
    'RCPsych',
    'Royal College of Physicians',
    'DVLA',
  ])('recognises "%s" as a national body', (term) => {
    expect(isNationalBody(term)).toBe(true);
  });

  it.each([
    "St Mary's Hospital",
    'the Whitfield practice',
    'Oakwood Care Home',
    'Tesco',
    'Ashfield Primary School',
  ])('does NOT treat "%s" (a specific institution) as a national body', (term) => {
    expect(isNationalBody(term)).toBe(false);
  });
});

describe('mergeOverlaps', () => {
  // FakeEntity is structurally assignable to the SDK Entity (subCategory optional).
  const ent = (offset: number, length: number, category: string, confidenceScore = 0.9) => ({
    text: 't',
    category,
    offset,
    length,
    confidenceScore,
  });

  it('collapses two entities on the same span into one, keeping the higher-confidence label', () => {
    expect(mergeOverlaps([ent(50, 9, 'A', 0.8), ent(50, 9, 'B', 0.9)])).toEqual([
      { start: 50, end: 59, category: 'B' },
    ]);
  });

  it('redacts the union of a partial overlap', () => {
    expect(mergeOverlaps([ent(10, 10, 'A'), ent(15, 10, 'B')])).toEqual([
      { start: 10, end: 25, category: 'A' }, // widest/first wins on a tie
    ]);
  });

  it('keeps the outer span when one entity is nested in another', () => {
    expect(mergeOverlaps([ent(10, 15, 'A'), ent(15, 5, 'B')])).toEqual([
      { start: 10, end: 25, category: 'A' },
    ]);
  });

  it('keeps adjacent (touching, non-overlapping) spans separate', () => {
    expect(mergeOverlaps([ent(10, 10, 'A'), ent(20, 10, 'B')])).toEqual([
      { start: 10, end: 20, category: 'A' },
      { start: 20, end: 30, category: 'B' },
    ]);
  });

  it('leaves disjoint spans untouched', () => {
    expect(mergeOverlaps([ent(10, 5, 'A'), ent(40, 5, 'B')])).toEqual([
      { start: 10, end: 15, category: 'A' },
      { start: 40, end: 45, category: 'B' },
    ]);
  });
});
