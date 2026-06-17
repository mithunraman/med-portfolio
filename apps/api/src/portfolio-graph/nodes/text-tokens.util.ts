/**
 * Shared text-tokenisation primitives for the compose-verify faithfulness check.
 * Pure and dependency-free so they can be unit-tested in isolation and reused
 * without pulling in node/LLM concerns.
 *
 * The verifier compares a model's output against ground-truth source text at the
 * token level. These helpers define what a "token" is: lower-cased, punctuation
 * stripped, and spelled-out numbers folded to digits ("six" ≡ "6").
 */

/** Spelled-out numbers normalised to digits so "six weeks" ≡ "6 weeks". */
export const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40',
  fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90',
};

// Short function words that legitimate prose adds freely; excluded from the
// content-word checks. Length ≥ 4 already filters most stopwords, so this only
// needs the common long-ish connectives.
export const STOPWORDS = new Set([
  'this', 'that', 'then', 'than', 'with', 'which', 'when', 'were', 'they',
  'them', 'their', 'there', 'have', 'from', 'into', 'after', 'before', 'while',
  'because', 'would', 'could', 'should', 'about', 'also', 'been', 'being',
]);

/** Lower-case, strip punctuation, fold spelled-out numbers to digits. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, ' ')
    .split(/\s+/)
    .map((tok) => NUMBER_WORDS[tok] ?? tok)
    .join(' ');
}

/** Numeric tokens (integers/decimals) in normalised text. */
export function numbers(normalised: string): string[] {
  return normalised.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
}

/** Content words: alphabetic tokens length ≥ 4, excluding stopwords. */
export function contentWords(normalised: string): string[] {
  return (normalised.match(/\b[a-z]{4,}\b/g) ?? []).filter((w) => !STOPWORDS.has(w));
}
