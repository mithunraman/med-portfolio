/**
 * Extracts the client-facing conversationId from the internal composite ID.
 * Format: {userId}_{conversationId} -> conversationId
 */
export function extractConversationId(internalId: string): string {
  const underscoreIndex = internalId.indexOf('_');
  return underscoreIndex === -1 ? internalId : internalId.substring(underscoreIndex + 1);
}

/**
 * Creates an internal composite ID from userId and conversationId.
 * Format: {userId}_{conversationId}
 */
export function createInternalConversationId(userId: string, conversationId: string): string {
  return `${userId}_${conversationId}`;
}
