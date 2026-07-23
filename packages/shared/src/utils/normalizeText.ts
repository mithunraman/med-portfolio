/**
 * Whitespace normalization for user-authored free text, applied at the API
 * boundary via Zod transforms. Both functions are pure and idempotent —
 * `f(f(x)) === f(x)` — which matters because clients re-submit stored text on
 * edit, so a non-idempotent cleaner would drift the value on every round-trip.
 */

/**
 * Collapse blank-line runs to at most one blank line, strip per-line trailing
 * whitespace, normalise CRLF/CR to LF, and trim. A single blank line is
 * preserved so paragraph breaks in reflections/justifications survive.
 */
export function normalizeMultilineText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n') // CRLF / CR -> LF
    .replace(/[ \t]+$/gm, '') // strip trailing spaces/tabs per line
    .replace(/\n{3,}/g, '\n\n') // 3+ newlines -> a single blank line
    .trim();
}

/**
 * Flatten every internal whitespace run (including newlines) to a single space
 * and trim — for fields that must be a single line, such as titles and names.
 */
export function normalizeSingleLineText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}
