/**
 * Type guard that filters out null and undefined values.
 * Useful in array.filter() to narrow types.
 *
 * @example
 * const items = [1, null, 2, undefined, 3];
 * const filtered = items.filter(isNotNull); // number[]
 */
export function isNotNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
