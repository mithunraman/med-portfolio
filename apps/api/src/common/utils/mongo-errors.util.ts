/**
 * Detect a MongoDB duplicate-key error (E11000). The driver surfaces these as
 * a thrown error with `code === 11000` and an optional `keyPattern` field.
 */
export function isMongoDuplicateKeyError(e: unknown, keyPattern?: string): boolean {
  if (typeof e !== 'object' || e === null || !('code' in e)) return false;
  if ((e as { code: unknown }).code !== 11000) return false;
  if (!keyPattern) return true;
  const pattern = (e as { keyPattern?: Record<string, unknown> }).keyPattern;
  return !!pattern && keyPattern in pattern;
}

/**
 * Detect a MongoDB transient transaction error — write conflicts, catalog
 * changes, primary step-downs, etc. The driver tags these by attaching the
 * `TransientTransactionError` label, signalling that the whole transaction can
 * be safely retried from the top.
 *
 * Repositories follow the Result pattern (never throw), but a transient error is
 * an infrastructure retry signal that belongs to the transaction layer, not a
 * domain error. Swallowing it into a `Result` strips the label and defeats
 * {@link TransactionService}'s backoff retry. Repositories should re-throw when
 * this returns true so the surrounding transaction can retry.
 */
export function isTransientTransactionError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'hasErrorLabel' in e &&
    typeof (e as { hasErrorLabel: unknown }).hasErrorLabel === 'function' &&
    (e as { hasErrorLabel: (label: string) => boolean }).hasErrorLabel(
      'TransientTransactionError',
    )
  );
}
