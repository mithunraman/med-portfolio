/**
 * Typography normalisation for model-written text before it is saved.
 *
 * Language models favour characters a person rarely types — em dashes, curly
 * quotes, ellipsis glyphs, arrows — and some emit invisible ones (zero-width
 * spaces, U+202F narrow no-break spaces). These read as machine-generated, so
 * the save node maps them to their plain-keyboard equivalents.
 *
 * Deliberately an explicit rule table rather than Unicode NFKC: NFKC would also
 * fold clinical notation (`mg/m²` → `mg/m2`, `½` → `1⁄2`). Anything not matched
 * below — µ, °, ±, ≥, ≤, ², ×, £, accented letters, primes — passes through.
 *
 * Pure and idempotent: normalising already-normalised text is a no-op.
 */

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Invisible characters: zero-width space/joiners, word joiner, BOM, soft hyphen,
  // bidi controls, variation selectors, Unicode tag characters. Removed first so
  // they can't sit between a word and a glyph and defeat the rules below.
  [/[​-‍⁠﻿­\u202A-\u202E\u2066-\u2069︀-️\u{E0000}-\u{E007F}]/gu, ''],
  // Exotic spaces (no-break, en/em/thin/hair, narrow no-break, ideographic) → space.
  [/[  -   　]/g, ' '],
  // Bullet glyphs and line-leading em dashes → plain hyphen bullet, indent kept.
  [/^([ \t]*)[•●▪‣—―][ \t]*/gm, '$1- '],
  // Em dash / horizontal bar → spaced hyphen. `[ \t]` not `\s`: never eat a newline.
  [/[ \t]*[—―][ \t]*/g, ' - '],
  // Hyphen variants, en dash, minus sign → hyphen, keeping the author's spacing.
  [/[‐-–−]/g, '-'],
  // Curly single quotes / apostrophes. Excludes the prime (′), used for minutes/feet.
  [/[‘’‚‛]/g, "'"],
  // Curly double quotes.
  [/[“-‟]/g, '"'],
  // Ellipsis glyph.
  [/…/g, '...'],
  // Arrows → `->` rather than "to", which can change meaning ("Plan → discharge").
  [/[ \t]*[→⇒⟶➔][ \t]*/g, ' -> '],
  // Tidy-up: collapse mid-line space runs left by the rules above (leading
  // indentation and newlines untouched)…
  [/(\S) {2,}/g, '$1 '],
  // …and strip trailing spaces (e.g. a line-ending em dash).
  [/ +$/gm, ''],
];

/** Map AI-typical typography to plain-keyboard characters. See module header. */
export function normaliseTypography(text: string): string {
  return RULES.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text
  ).trim();
}
