/**
 * Deterministic, format-based redaction of UK PII. Two entry points with
 * different coverage, because two callers have different needs:
 *
 * - {@link redactUkStructuredPii} — the narrow **post-Azure backstop**. Runs
 *   AFTER Azure PHI on the send path to catch UK-specific structured IDs (NHS
 *   number, CHI, NINO, sort code + account, postcode) a general ML model can miss
 *   because they look like ordinary numbers. Deliberately narrow: names, phones,
 *   emails and dates are Azure's job and are NOT matched here, so running it a
 *   second time on Azure's output adds no duplication or false-positive surface.
 *
 * - {@link redactUkOfflinePii} — the wider **standalone offline** redactor. For
 *   the caller that has NO Azure layer ahead of it (message edit runs in-process
 *   inside a Mongo transaction, where a network call has no place). It adds the
 *   contact / free-form patterns (email, phone, card, DOB, absolute dates) on
 *   top of the structured IDs. It still cannot see contextual PII (names,
 *   organisations) — that gap is documented on the edit path.
 *
 * Detection is by *shape* (so phrasing is irrelevant), gated where needed by
 * *validators* (checksums / strict formats) that reject candidates which merely
 * look right — this is what keeps shape-matching safe on clinical prose (BP
 * readings, drug doses, lab values).
 */

interface UkPiiPattern {
  /** Stable type identifier, also used to log which categories were removed. */
  type: string;
  /** Entity-label placeholder substituted for a validated match. */
  placeholder: string;
  /** Global regex proposing candidate spans. */
  pattern: RegExp;
  /**
   * Optional gate: a matched candidate is only redacted when this returns true.
   * Absence means the regex format is itself sufficient (e.g. hyphened sort code).
   */
  validate?: (match: string) => boolean;
}

export interface StructuredRedactionResult {
  redactedText: string;
  /** Types removed, value-free — safe to log. */
  entities: { type: string }[];
}

// ── Validators ──────────────────────────────────────────────────────────────

/**
 * Modulus-11 check-digit validation over a 10-digit string (digits 1-9 weighted
 * 10→2, tenth is the check digit). Shared by NHS and CHI numbers, which use the
 * same scheme. A check digit of 10 is invalid; 11 maps to 0.
 */
export function isValidMod11(tenDigits: string): boolean {
  if (!/^\d{10}$/.test(tenDigits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(tenDigits[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false;
  return check === Number(tenDigits[9]);
}

/** NHS number: 10 digits (any 3-3-4 spacing), mod-11 valid. */
export function isValidNhsNumber(match: string): boolean {
  return isValidMod11(match.replace(/\s/g, ''));
}

/**
 * CHI number (Scotland): 10 digits, first six a plausible DDMMYY date, mod-11
 * valid. The date constraint distinguishes it from a bare NHS number and cuts
 * false positives on arbitrary 10-digit runs.
 */
export function isValidChiNumber(match: string): boolean {
  const digits = match.replace(/\s/g, '');
  if (!/^\d{10}$/.test(digits)) return false;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  if (day < 1 || day > 31 || month < 1 || month > 12) return false;
  return isValidMod11(digits);
}

const NINO_DISALLOWED_PREFIXES = new Set(['BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ']);
const NINO_INVALID_FIRST = new Set(['D', 'F', 'I', 'Q', 'U', 'V']);
const NINO_INVALID_SECOND = new Set(['D', 'F', 'I', 'O', 'Q', 'U', 'V']);

/** National Insurance number: strict prefix/suffix rules over `AA123456A`. */
export function isValidNino(match: string): boolean {
  const s = match.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{6}[A-D]$/.test(s)) return false;
  const [first, second] = s;
  if (NINO_INVALID_FIRST.has(first)) return false;
  if (NINO_INVALID_SECOND.has(second)) return false;
  if (NINO_DISALLOWED_PREFIXES.has(first + second)) return false;
  return true;
}

// ── Structured-identifier patterns (ordered specific → generic) ───────────────
// The narrow, checksum-gated set. Safe to run last on Azure's output because
// each match is either validated (NHS/CHI/NINO) or format-strict (hyphened sort
// code + account), so clinical numbers (BP, doses) are never grabbed.
//
// Note: there is deliberately NO *bare* sort-code pattern (\d{2}-\d{2}-\d{2}).
// It is shape-identical to a dd-mm-yy date, so it mislabels far more clinical
// dates than it ever catches real sort codes — which are vanishingly rare in a
// medical reflective app. A genuine bare sort code is still redacted on the
// edit path (it is date-shaped, so the DATE rule in CONTACT_PATTERNS masks it as
// [DATE]); only the sort-code + account-number combination, which is
// unambiguous, is matched here.

const STRUCTURED_PATTERNS: UkPiiPattern[] = [
  // Sort code + account number together — unambiguous (a 6-8 digit account after
  // the hyphened sort code cannot occur in clinical prose).
  {
    type: 'BANK_ACCOUNT',
    placeholder: '[BANK_ACCOUNT]',
    pattern: /\b\d{2}-\d{2}-\d{2}\s+\d{6,8}\b/g,
  },
  // CHI before NHS: both are 10-digit mod-11, CHI's date prefix makes it specific.
  {
    type: 'CHI_NUMBER',
    placeholder: '[CHI_NUMBER]',
    pattern: /\b\d{10}\b/g,
    validate: isValidChiNumber,
  },
  {
    type: 'NHS_NUMBER',
    placeholder: '[NHS_NUMBER]',
    pattern: /\b\d{3}\s?\d{3}\s?\d{4}\b/g,
    validate: isValidNhsNumber,
  },
  {
    type: 'NI_NUMBER',
    placeholder: '[NI_NUMBER]',
    pattern: /\b[A-Za-z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Za-z]\b/g,
    validate: isValidNino,
  },
  {
    type: 'POSTCODE',
    placeholder: '[POSTCODE]',
    pattern: /\b[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}\b/g,
  },
];

// ── Contact / free-form patterns ──────────────────────────────────────────────
// These overlap with Azure's semantic layer, so they are NOT part of the
// post-Azure backstop — only the standalone offline path (message edit) runs
// them, via redactUkOfflinePii. Ordered after the structured set: the validated
// IDs claim their spans first, then these catch what remains.

const CONTACT_PATTERNS: UkPiiPattern[] = [
  // Credit/debit card: 16 digits in four groups (spaces/dashes optional).
  {
    type: 'CARD',
    placeholder: '[CARD]',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  },
  // UK phone: mobile (07…) or landline (01/02/03…), optional +44. Lookbehind
  // (not \b) because \b does not fire before a leading '+'.
  {
    type: 'PHONE',
    placeholder: '[PHONE]',
    pattern: /(?<!\w)(?:\+44\s?(?:\(0\))?\s?|0)(?:7\d{3}|\d{3,4})\s?\d{3}\s?\d{3,4}\b/g,
  },
  // Email address.
  {
    type: 'EMAIL',
    placeholder: '[EMAIL]',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // Date of birth with explicit context — before the generic date pattern.
  {
    type: 'DOB',
    placeholder: '[DOB]',
    pattern:
      /\b(?:date\s+of\s+birth|DOB|d\.o\.b\.?|born\s+on)\s*:?\s*\d{1,2}[\s/.-]\d{1,2}[\s/.-]\d{2,4}\b/gi,
  },
  // Absolute calendar date (DD/MM/YY(YY)). Leading (?<!\d) avoids matching the
  // tail of a longer number run (a BP reading like 140/90 has one separator, so
  // it never matches — this guards multi-number strings like "5140/90/12").
  {
    type: 'DATE',
    placeholder: '[DATE]',
    pattern: /(?<!\d)\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  },
];

/**
 * Run an ordered pattern list over the text. Each pattern does a global replace,
 * substituting its placeholder only when the (optional) validator accepts the
 * candidate. Running sequentially over the mutating string lets a more specific
 * pattern (CHI) claim a span before a broader one (NHS) sees it.
 */
function redactWith(text: string, patterns: UkPiiPattern[]): StructuredRedactionResult {
  const found = new Set<string>();
  let redactedText = text;

  for (const { type, placeholder, pattern, validate } of patterns) {
    redactedText = redactedText.replace(pattern, (match) => {
      if (validate && !validate(match)) return match;
      found.add(type);
      return placeholder;
    });
  }

  return {
    redactedText,
    entities: [...found].map((type) => ({ type })),
  };
}

/**
 * Narrow, post-Azure backstop: UK structured identifiers only. Standard PII
 * (names, phones, emails, dates) is Azure's responsibility and is deliberately
 * left untouched here.
 */
export function redactUkStructuredPii(text: string): StructuredRedactionResult {
  return redactWith(text, STRUCTURED_PATTERNS);
}

/**
 * Wider, standalone offline redactor for callers with no Azure layer ahead of
 * them (message edit). Structured identifiers PLUS contact / free-form PII
 * (email, phone, card, DOB, absolute dates). Cannot detect contextual PII
 * (names, organisations) — that remains an accepted gap on the offline edit path.
 */
export function redactUkOfflinePii(text: string): StructuredRedactionResult {
  return redactWith(text, [...STRUCTURED_PATTERNS, ...CONTACT_PATTERNS]);
}
