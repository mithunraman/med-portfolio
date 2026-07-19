import {
  isValidChiNumber,
  isValidMod11,
  isValidNhsNumber,
  isValidNino,
  redactUkOfflinePii,
  redactUkStructuredPii,
} from '../uk-pii-patterns';

describe('validators', () => {
  describe('isValidMod11 / isValidNhsNumber', () => {
    it('accepts a valid NHS number and rejects a bad check digit', () => {
      expect(isValidMod11('9434765919')).toBe(true);
      expect(isValidMod11('9434765918')).toBe(false); // wrong check digit
      expect(isValidNhsNumber('943 476 5919')).toBe(true); // spacing tolerated
      expect(isValidNhsNumber('943 476 5918')).toBe(false);
    });

    it('rejects non-10-digit input', () => {
      expect(isValidMod11('12345')).toBe(false);
      expect(isValidMod11('12345678901')).toBe(false);
    });
  });

  describe('isValidChiNumber', () => {
    it('accepts a valid date + checksum and rejects an implausible date', () => {
      expect(isValidChiNumber('0101801238')).toBe(true); // 01/01/80, valid checksum
      expect(isValidChiNumber('9901801238')).toBe(false); // day 99
      expect(isValidChiNumber('0113801238')).toBe(false); // month 13
    });
  });

  describe('isValidNino', () => {
    it('accepts a valid NINO', () => {
      expect(isValidNino('AB123456C')).toBe(true);
      expect(isValidNino('AB 12 34 56 C')).toBe(true);
    });

    it('rejects invalid prefixes and suffixes', () => {
      expect(isValidNino('QQ123456C')).toBe(false); // Q not allowed
      expect(isValidNino('DA123456C')).toBe(false); // D first not allowed
      expect(isValidNino('BG123456A')).toBe(false); // disallowed prefix
      expect(isValidNino('AB123456E')).toBe(false); // suffix must be A-D
    });
  });
});

describe('redactUkStructuredPii', () => {
  const redact = (t: string) => redactUkStructuredPii(t).redactedText;
  const types = (t: string) => redactUkStructuredPii(t).entities.map((e) => e.type);

  it('catches an NHS number regardless of phrasing (shape-based)', () => {
    // The exact phrasing that OpenRedaction missed — "is" between keyword and number.
    const out = redact('Her NHS number is 943 476 5919 today');
    expect(out).toBe('Her NHS number is [NHS_NUMBER] today');
    expect(types('Her NHS number is 943 476 5919 today')).toContain('NHS_NUMBER');
  });

  it('catches an unspaced NHS number', () => {
    expect(redact('ref 9434765919 noted')).toBe('ref [NHS_NUMBER] noted');
  });

  it('does NOT redact an invalid NHS number (checksum gate)', () => {
    expect(redact('number 943 476 5918')).toBe('number 943 476 5918');
  });

  it('catches a CHI number as [CHI_NUMBER], not [NHS_NUMBER]', () => {
    expect(redact('CHI 0101801238 on file')).toBe('CHI [CHI_NUMBER] on file');
  });

  it('catches a National Insurance number', () => {
    expect(redact('NI number AB123456C')).toBe('NI number [NI_NUMBER]');
  });

  it('catches sort code + account (unambiguous), but NOT a bare sort code', () => {
    expect(redact('pay 12-34-56 87654321')).toBe('pay [BANK_ACCOUNT]');
    // A bare sort code is shape-identical to a dd-mm-yy date, so it is
    // deliberately not matched by the structured backstop (Azure/date rules own
    // that space) — it must not become [SORT_CODE].
    expect(redact('sort 12-34-56 please')).toBe('sort 12-34-56 please');
  });

  it('does NOT redact a hyphenated date as a sort code (dd-mm-yy left for the date rule)', () => {
    // The structured backstop leaves it untouched; on the send path Azure has
    // already handled the date, and the offline path masks it as [DATE].
    expect(redact('I saw the patient on 01-02-26')).toBe('I saw the patient on 01-02-26');
  });

  it('catches a UK postcode', () => {
    expect(redact('clinic at SW1A 1AA')).toBe('clinic at [POSTCODE]');
  });

  it('does NOT over-redact clinical prose (no false positives)', () => {
    const clinical = 'BP 140/90, HR 88, tamsulosin 400mcg, eGFR 59';
    expect(redact(clinical)).toBe(clinical);
    expect(types(clinical)).toEqual([]);
  });

  it('leaves standard PII (phone/email/date) for Azure — not matched here', () => {
    const t = 'call 07700900123, email x@nhs.net, DOB 12/05/1980';
    expect(redact(t)).toBe(t);
  });

  it('leaves Azure placeholder tokens untouched (safe to run second)', () => {
    const azureOutput = 'Seen by [PERSON] at the [ORGANIZATION].';
    expect(redact(azureOutput)).toBe(azureOutput);
  });
});

describe('redactUkOfflinePii (standalone — no Azure ahead)', () => {
  const redact = (t: string) => redactUkOfflinePii(t).redactedText;
  const types = (t: string) => redactUkOfflinePii(t).entities.map((e) => e.type);

  it('still catches every structured identifier redactUkStructuredPii does', () => {
    expect(redact('NHS 943 476 5919, NI AB123456C, acct 12-34-56 87654321, post SW1A 1AA')).toBe(
      'NHS [NHS_NUMBER], NI [NI_NUMBER], acct [BANK_ACCOUNT], post [POSTCODE]'
    );
  });

  it('masks a hyphenated encounter date as [DATE], not [SORT_CODE]', () => {
    // The exact scenario from review: dd-mm-yy must land as [DATE] on the
    // offline path (absolute encounter date — a quasi-identifier we redact).
    expect(redact('I saw the patient on 01-02-26')).toBe('I saw the patient on [DATE]');
    expect(redact('follow-up 12-05-19')).toBe('follow-up [DATE]');
  });

  it('catches contact PII the backstop defers to Azure (email, phone, card)', () => {
    expect(redact('call 07700 900123 or email x@nhs.net')).toBe(
      'call [PHONE] or email [EMAIL]'
    );
    expect(redact('unspaced 07700900123')).toBe('unspaced [PHONE]');
    expect(redact('card 4111 1111 1111 1111 on file')).toBe('card [CARD] on file');
  });

  it('catches an absolute date and a DOB, keeping the DOB label distinct', () => {
    expect(redact('seen on 12/05/1980')).toBe('seen on [DATE]');
    expect(redact('DOB 12/05/1980')).toBe('[DOB]');
    expect(types('DOB 12/05/1980')).toContain('DOB');
  });

  it('does NOT over-redact a BP reading as a date (single separator)', () => {
    const clinical = 'BP 140/90, HR 88, tamsulosin 400mcg';
    expect(redact(clinical)).toBe(clinical);
    expect(types(clinical)).toEqual([]);
  });

  it('leaves relative time expressions intact (only absolute dates match)', () => {
    const t = 'reviewed the case three weeks ago, again today';
    expect(redact(t)).toBe(t);
  });
});
