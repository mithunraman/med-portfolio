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
