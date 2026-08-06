/**
 * G-1 — does a planted string survive in the pipeline output?
 *
 * This is the whole measurement primitive. Everything else in G-1 counts what
 * this function returns, so a bug here silently changes the reported recall
 * rate rather than failing anything.
 *
 * ## Two match modes, because one rule cannot serve both
 *
 * Structured identifiers are written inconsistently by humans and by ASR:
 * `999 100 0003` and `9991000003` are the SAME NHS number, so separators must
 * be ignored. But applying that rule to words makes `Bell` match `Bellwether`,
 * reporting a leak that did not happen.
 *
 * So the mode is chosen by identifier type:
 *
 * - `structured` — strip every non-alphanumeric from both sides, then substring.
 * - `lexical`    — case-fold, collapse whitespace, match on **letter/digit
 *                  boundaries** (not `\b`, see below).
 *
 * ## Why not `\b`
 *
 * Planted values legitimately end in punctuation — `J.T.`, `94%`. JavaScript's
 * `\b` sits between a word and a non-word character, so `\bJ\.T\.\b` fails to
 * match `J.T. came`: both the final `.` and the following space are non-word,
 * so there is no boundary to assert. Explicit lookarounds for "not a letter or
 * digit" express the intent directly and handle those values correctly.
 *
 * Unicode property escapes (`\p{L}`) rather than `[a-z]` — the corpus contains
 * `Nguyễn`, and an ASCII class would treat `ễ` as a boundary and match a
 * fragment.
 */

/**
 * Identifier types matched by stripping separators.
 *
 * These are the classes where formatting varies but the underlying token does
 * not. Everything else falls through to `lexical`, which is the safe default —
 * it under-matches (a missed leak is reported as a leak only if it is really
 * there) rather than over-matching.
 */
const STRUCTURED_TYPES = new Set([
  'NHS_NUMBER',
  'CHI_NUMBER',
  'NI_NUMBER',
  'PHONE',
  'POSTCODE',
  'VEHICLE',
  'HOSPITAL_NUMBER',
  'BANK_ACCOUNT',
]);

export type MatchMode = 'structured' | 'lexical';

export function matchModeFor(type: string): MatchMode {
  return STRUCTURED_TYPES.has(type.toUpperCase()) ? 'structured' : 'lexical';
}

/** Lowercase, drop everything that is not a letter or digit. */
function structuralForm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Lowercase, treat hyphens as spaces, and collapse whitespace runs.
 *
 * The whitespace collapse is load-bearing: corpus text is stored as YAML block
 * scalars, so a multi-word value like `Marlbrook Vale Surgery` may be split
 * across a line break. Without it, those keys would never match and would score
 * as caught.
 *
 * **Hyphens are normalised to spaces after the 2026-08-05 run scored a false
 * pass.** The corpus planted the age `nine year old`; the cleaning stage emitted
 * `nine-year-old`; the age was plainly still there and the scorer reported it
 * caught. Hyphenation is a formatting choice an LLM makes freely, so it cannot
 * be allowed to decide whether an identifier counts as leaked.
 *
 * Safe for the values that legitimately contain hyphens — `Fitzwilliam-Oyelaran`
 * becomes `fitzwilliam oyelaran`, and the boundary lookarounds still resolve
 * `Oyelaran` inside it, because a space is as good a boundary as a hyphen.
 */
function lexicalForm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

function escapeRegex(s: string): string {
  return s.replace(REGEX_METACHARACTERS, '\\$&');
}

/**
 * True if `needle` still appears in `haystack` under the rules for `type`.
 *
 * Used in both directions:
 * - a planted identifier that appears → a **leak** (false negative)
 * - a must-survive term that does NOT appear → **over-redaction**
 */
export function appearsIn(needle: string, haystack: string, type: string): boolean {
  if (!needle.trim()) return false;

  if (matchModeFor(type) === 'structured') {
    const n = structuralForm(needle);
    return n.length > 0 && structuralForm(haystack).includes(n);
  }

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegex(lexicalForm(needle))}(?![\\p{L}\\p{N}])`,
    'u'
  );
  return pattern.test(lexicalForm(haystack));
}

/**
 * Whether a must-survive term is still present.
 *
 * Always lexical: these are clinical words, acronyms and short numbers in prose
 * (`NICE`, `HbA1c`, `140/90`, `111`), never formatted identifiers. Matching
 * `111` structurally would find it inside any longer digit run.
 */
export function survivesRedaction(term: string, output: string): boolean {
  return appearsIn(term, output, 'TERM');
}
