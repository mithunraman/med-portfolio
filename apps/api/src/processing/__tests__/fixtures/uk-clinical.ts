/**
 * Synthetic UK clinical reflective-practice snippets for redaction regression
 * tests. NOT real patient data — every name, number, and address is invented.
 *
 * Each fixture separates the two redaction concerns to mirror the real pipeline:
 *  - `phi`     — standard PII Azure PHI catches: names, places, organisations,
 *                phone numbers, emails, postcodes, dates. Tests stub Azure to
 *                redact these.
 *  - `structured` — UK health/gov/bank identifiers the offline backstop catches
 *                (NHS number, sort code + account) — the IDs a general ML model
 *                can miss because they look like ordinary numbers.
 *  - `preserve` — clinically meaningful text that must survive redaction (BP
 *                readings, drug doses), guarding against over-redaction.
 */
export interface ClinicalFixture {
  name: string;
  text: string;
  /** Contextual identifiers redacted by the (mocked) Azure PHI layer. */
  phi: { token: string; category: string }[];
  /** Substrings that must be absent from the final redacted output. */
  structured: string[];
  /** Substrings that must remain present in the final redacted output. */
  preserve: string[];
}

export const UK_CLINICAL_FIXTURES: ClinicalFixture[] = [
  {
    name: 'named patient with NHS number, postcode and phone',
    text:
      "Discussed Mrs Patel's case with Dr Okafor at the Whitfield practice. Her NHS " +
      'number is 943 476 5919 and she lives at SW1A 1AA. Contact her daughter on 07700900123.',
    phi: [
      { token: 'Patel', category: 'Person' },
      { token: 'Okafor', category: 'Person' },
      { token: 'Whitfield practice', category: 'Organization' },
      { token: 'SW1A 1AA', category: 'Address' },
      { token: '07700900123', category: 'PhoneNumber' },
    ],
    structured: ['943 476 5919'],
    preserve: ['Discussed', 'daughter'],
  },
  {
    name: 'DOB, email and bank details alongside clinical readings',
    text:
      'Reviewed John Smith, DOB 12/05/1980, email john.smith@nhs.net. Refund to sort code ' +
      '12-34-56 87654321. Lying and standing BP 140/90 then 120/70. Started tamsulosin 400mcg.',
    phi: [
      { token: 'John Smith', category: 'Person' },
      { token: '12/05/1980', category: 'DateTime' },
      { token: 'john.smith@nhs.net', category: 'Email' },
    ],
    structured: ['12-34-56 87654321'],
    preserve: ['BP 140/90', '120/70', 'tamsulosin 400mcg'],
  },
];
