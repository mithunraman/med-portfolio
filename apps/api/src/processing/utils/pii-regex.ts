/**
 * Deterministic PII redaction for structured identifiers with known formats.
 * Runs before the LLM redaction stage to guarantee these patterns are always caught.
 *
 * UK-focused: NHS numbers, UK phone numbers, postcodes, NI numbers, etc.
 */

interface PiiPattern {
  entity: string;
  placeholder: string;
  pattern: RegExp;
}

/**
 * Order matters: more specific patterns first to avoid partial matches.
 * e.g. NHS number (10 digits) before generic phone patterns.
 */
const PII_PATTERNS: PiiPattern[] = [
  // NHS number: XXX XXX XXXX or XXXXXXXXXX (10 digits)
  {
    entity: 'healthcare_number',
    placeholder: '[NHS-NUMBER]',
    pattern: /\b\d{3}\s\d{3}\s\d{4}\b/g,
  },
  // National Insurance number: AB 12 34 56 C (with or without spaces)
  {
    entity: 'ni_number',
    placeholder: '[NI-NUMBER]',
    pattern: /\b[A-Za-z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Da-d]\b/g,
  },
  // UK passport number: 9 digits
  {
    entity: 'passport',
    placeholder: '[PASSPORT]',
    pattern: /\bpassport\s*(?:number|no\.?|#)?\s*:?\s*\d{9}\b/gi,
  },
  // Driver's licence: UK format MORGA657054SM9IJ (16 chars) — simplified to catch common patterns
  {
    entity: 'drivers_license',
    placeholder: '[ID-NUMBER]',
    pattern: /\b(?:driver'?s?\s*licen[cs]e|driving\s*licen[cs]e)\s*(?:number|no\.?|#)?\s*:?\s*[A-Za-z0-9]{14,16}\b/gi,
  },
  // Credit card: 16 digits with optional spaces/dashes
  {
    entity: 'credit_card_number',
    placeholder: '[CARD-NUMBER]',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  },
  // Bank sort code + account: XX-XX-XX XXXXXXXX (requires hyphens in sort code to avoid false positives)
  {
    entity: 'banking_information',
    placeholder: '[BANK-INFO]',
    pattern: /\b\d{2}-\d{2}-\d{2}\s+\d{6,8}\b/g,
  },
  // Email address
  {
    entity: 'email_address',
    placeholder: '[EMAIL]',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // UK phone: mobile (07...) or landline (01.../02.../03...) with optional +44
  // Uses (?<!\w) instead of \b because \b doesn't work before +
  {
    entity: 'phone_number',
    placeholder: '[PHONE]',
    pattern: /(?<!\w)(?:\+44\s?(?:\(0\))?\s?|0)(?:7\d{3}|\d{3,4})\s?\d{3}\s?\d{3,4}\b/g,
  },
  // UK postcode: A9 9AA, A99 9AA, A9A 9AA, AA9 9AA, AA99 9AA, AA9A 9AA
  {
    entity: 'postcode',
    placeholder: '[POSTCODE]',
    pattern: /\b[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}\b/g,
  },
  // Date of birth with explicit DOB/born context — catch before generic dates
  {
    entity: 'date_of_birth',
    placeholder: '[DOB]',
    pattern:
      /\b(?:date\s+of\s+birth|DOB|d\.o\.b\.?|born\s+on)\s*:?\s*\d{1,2}[\s/.-]\d{1,2}[\s/.-]\d{2,4}\b/gi,
  },
  // Specific calendar dates: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (2 or 4 digit year)
  // Negative lookbehind to avoid matching BP readings like 140/90
  {
    entity: 'date',
    placeholder: '[DATE]',
    pattern: /(?<!\d)\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  },
];

export interface RedactionResult {
  redactedText: string;
  redactedEntities: string[];
}

/**
 * Apply all regex-based PII patterns to the input text.
 * Returns the redacted text and a list of entity types that were found.
 */
export function redactStructuredPii(text: string): RedactionResult {
  const foundEntities = new Set<string>();
  let result = text;

  for (const { entity, placeholder, pattern } of PII_PATTERNS) {
    // Reset lastIndex for global regex patterns
    pattern.lastIndex = 0;

    const replaced = result.replace(pattern, () => {
      foundEntities.add(entity);
      return placeholder;
    });

    result = replaced;
  }

  return {
    redactedText: result,
    redactedEntities: Array.from(foundEntities),
  };
}
