import { z } from 'zod';
import { normalizeMultilineText, normalizeSingleLineText } from './normalizeText';

interface TextConstraints {
  min?: number;
  max?: number;
  minMessage?: string;
  maxMessage?: string;
}

function applyLength(schema: z.ZodString, { min, max, minMessage, maxMessage }: TextConstraints) {
  let s = schema;
  if (min != null) s = s.min(min, minMessage);
  if (max != null) s = s.max(max, maxMessage);
  return s;
}

/**
 * Multi-line free text: normalised first, then length-validated on the *cleaned*
 * value so a whitespace-only input correctly fails a `min`. Use for reflections,
 * notes, justifications, and descriptions.
 */
export const multilineText = (opts: TextConstraints = {}) =>
  z.string().transform(normalizeMultilineText).pipe(applyLength(z.string(), opts));

/**
 * Single-line free text (titles, names): internal whitespace flattened to single
 * spaces, then length-validated on the cleaned value.
 */
export const singleLineText = (opts: TextConstraints = {}) =>
  z.string().transform(normalizeSingleLineText).pipe(applyLength(z.string(), opts));

/**
 * Nullable multi-line free text: whitespace-only input normalises to `null`
 * (a clean "no value" state) and an incoming `null` passes through. `max` is
 * validated on the *cleaned* value, consistent with `multilineText`/
 * `singleLineText`. Use for optional reflections/comments.
 */
export const nullableMultilineText = (opts: Pick<TextConstraints, 'max' | 'maxMessage'> = {}) =>
  z
    .string()
    .transform(normalizeMultilineText)
    .pipe(applyLength(z.string(), opts))
    .transform((v) => (v.length === 0 ? null : v))
    .nullable();
