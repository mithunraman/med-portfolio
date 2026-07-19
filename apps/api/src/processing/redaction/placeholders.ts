/**
 * Single source of truth for the SHAPE of a redaction placeholder token, shared
 * by the redaction layer that emits them and the cleaning-stage guard that
 * verifies them — so the shape is defined once, not independently re-derived in
 * the guard where it could silently drift out of sync.
 *
 * Both redactors emit uppercase-snake tokens in square brackets:
 *  - the Azure layer via `toPlaceholder()` (category → `[UPPER_SNAKE]` by
 *    construction), and
 *  - the offline `uk-pii-patterns` via literal placeholders (`[NHS_NUMBER]`, …).
 *
 * A conformance test (placeholders.spec.ts) asserts every placeholder either
 * redactor can emit is recognised here, turning a future non-conforming token
 * (e.g. a hand-written `[Care-Home]`) into a failing test rather than a silent
 * gap in the guard.
 */

// Body of a single placeholder token: uppercase letters, digits and underscores
// inside square brackets. Kept as a string so the anchored validator and the
// global extractor below both derive from ONE definition.
const PLACEHOLDER_TOKEN = '\\[[A-Z0-9_]+\\]';

/** Matches a single placeholder token exactly — for validating one token. */
export const PLACEHOLDER_PATTERN = new RegExp(`^${PLACEHOLDER_TOKEN}$`);

/** The set of distinct placeholder token types present in a string. */
export function placeholderTypes(text: string): Set<string> {
  // A fresh global regex per call — a shared global RegExp carries lastIndex state.
  return new Set(text.match(new RegExp(PLACEHOLDER_TOKEN, 'g')) ?? []);
}
