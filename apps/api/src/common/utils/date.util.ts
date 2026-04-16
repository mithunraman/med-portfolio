/**
 * Safely converts a value that may be a Date, an ISO string, or null/undefined
 * into an ISO string or null. Handles Mongoose lean documents where Date fields
 * may arrive as either Date objects or pre-serialized strings.
 */
export function toISOStringOrNull(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
}
