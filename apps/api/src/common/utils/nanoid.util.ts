import { customAlphabet } from 'nanoid';

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const nanoidAlphanumeric = customAlphabet(ALPHANUMERIC, 21);

/**
 * Generate a unique external ID (xid) for database documents.
 * Used when you need to generate the xid before creating the document
 * (e.g., when the xid is needed to construct other fields like storage keys).
 */
export function generateXid(): string {
  return nanoidAlphanumeric();
}
