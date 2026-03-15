import * as Crypto from 'expo-crypto';

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a 16-character alphanumeric idempotency key using expo-crypto.
 * Uniqueness is scoped per-user on the backend (compound index: userId + idempotencyKey).
 */
export function generateIdempotencyKey(): string {
  const bytes = Crypto.getRandomBytes(16);
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += ALPHANUMERIC[bytes[i] % ALPHANUMERIC.length];
  }
  return result;
}
