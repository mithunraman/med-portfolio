import { redactStructuredPii } from '../utils/pii-regex';

describe('redactStructuredPii', () => {
  // ── NHS Numbers ──

  it('should redact NHS number with spaces (XXX XXX XXXX)', () => {
    const result = redactStructuredPii('NHS number is 943 476 5919');
    expect(result.redactedText).toBe('NHS number is [NHS-NUMBER]');
    expect(result.redactedEntities).toContain('healthcare_number');
  });

  // ── NI Numbers ──

  it('should redact National Insurance number with spaces', () => {
    const result = redactStructuredPii('NI number AB 12 34 56 C');
    expect(result.redactedText).toBe('NI number [NI-NUMBER]');
    expect(result.redactedEntities).toContain('ni_number');
  });

  it('should redact NI number without spaces', () => {
    const result = redactStructuredPii('NI number AB123456C');
    expect(result.redactedText).toContain('[NI-NUMBER]');
  });

  // ── Email Addresses ──

  it('should redact email addresses', () => {
    const result = redactStructuredPii('email john.smith@nhs.net for results');
    expect(result.redactedText).toBe('email [EMAIL] for results');
    expect(result.redactedEntities).toContain('email_address');
  });

  // ── UK Phone Numbers ──

  it('should redact UK mobile numbers', () => {
    const result = redactStructuredPii('call on 07700 900123');
    expect(result.redactedText).toBe('call on [PHONE]');
    expect(result.redactedEntities).toContain('phone_number');
  });

  it('should redact UK landline numbers', () => {
    const result = redactStructuredPii('phone 0207 123 4567');
    expect(result.redactedText).toBe('phone [PHONE]');
    expect(result.redactedEntities).toContain('phone_number');
  });

  it('should redact +44 phone numbers', () => {
    const result = redactStructuredPii('call +44 7700 900123');
    expect(result.redactedText).toBe('call [PHONE]');
    expect(result.redactedEntities).toContain('phone_number');
  });

  // ── UK Postcodes ──

  it('should redact UK postcodes', () => {
    const result = redactStructuredPii('lives in SW1A 1AA');
    expect(result.redactedText).toBe('lives in [POSTCODE]');
    expect(result.redactedEntities).toContain('postcode');
  });

  it('should redact shorter postcodes', () => {
    const result = redactStructuredPii('postcode M1 1AA');
    expect(result.redactedText).toBe('postcode [POSTCODE]');
  });

  // ── Credit Card Numbers ──

  it('should redact credit card numbers with spaces', () => {
    const result = redactStructuredPii('card 4111 1111 1111 1111');
    expect(result.redactedText).toBe('card [CARD-NUMBER]');
    expect(result.redactedEntities).toContain('credit_card_number');
  });

  // ── Date of Birth ──

  it('should redact explicit DOB with label', () => {
    const result = redactStructuredPii('DOB 15/03/1987');
    expect(result.redactedText).toBe('[DOB]');
    expect(result.redactedEntities).toContain('date_of_birth');
  });

  it('should redact "date of birth" with value', () => {
    const result = redactStructuredPii('date of birth: 01/01/1990');
    expect(result.redactedText).toBe('[DOB]');
    expect(result.redactedEntities).toContain('date_of_birth');
  });

  // ── Generic Dates ──

  it('should redact calendar dates in DD/MM/YYYY format', () => {
    const result = redactStructuredPii('seen on 12/03/2024');
    expect(result.redactedText).toBe('seen on [DATE]');
    expect(result.redactedEntities).toContain('date');
  });

  // ── False Positives (must NOT redact) ──

  it('should NOT redact blood pressure readings', () => {
    const result = redactStructuredPii('BP was 140/90');
    expect(result.redactedText).toBe('BP was 140/90');
  });

  it('should NOT redact ages', () => {
    const result = redactStructuredPii('72-year-old patient');
    expect(result.redactedText).toBe('72-year-old patient');
  });

  it('should NOT redact medication doses', () => {
    const result = redactStructuredPii('prescribed Metformin 500mg twice daily');
    expect(result.redactedText).toBe('prescribed Metformin 500mg twice daily');
  });

  it('should NOT redact clinical scores', () => {
    const result = redactStructuredPii('NEWS score was 3');
    expect(result.redactedText).toBe('NEWS score was 3');
  });

  // ── No PII ──

  it('should return empty entities when no PII found', () => {
    const result = redactStructuredPii(
      'The patient presented with chest pain and shortness of breath.'
    );
    expect(result.redactedEntities).toEqual([]);
    expect(result.redactedText).toBe(
      'The patient presented with chest pain and shortness of breath.'
    );
  });

  // ── Multiple PII in one text ──

  it('should redact multiple PII types in a single text', () => {
    const input =
      'Patient NHS number 943 476 5919, email patient@nhs.net, phone 07700 900123';
    const result = redactStructuredPii(input);
    expect(result.redactedText).toBe(
      'Patient NHS number [NHS-NUMBER], email [EMAIL], phone [PHONE]'
    );
    expect(result.redactedEntities).toContain('healthcare_number');
    expect(result.redactedEntities).toContain('email_address');
    expect(result.redactedEntities).toContain('phone_number');
  });
});
