/**
 * Generate a unique request ID for tracing.
 * Works in both browser and React Native environments.
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}
