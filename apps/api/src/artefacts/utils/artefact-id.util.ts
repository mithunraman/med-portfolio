/**
 * Extracts the client-facing artefactId from the internal composite ID.
 * Format: {userId}_{artefactId} -> artefactId
 */
export function extractArtefactClientId(internalId: string): string {
  const underscoreIndex = internalId.indexOf('_');
  return underscoreIndex === -1 ? internalId : internalId.substring(underscoreIndex + 1);
}

/**
 * Creates an internal composite ID from userId and artefactId.
 * Format: {userId}_{artefactId}
 */
export function createInternalArtefactId(userId: string, artefactId: string): string {
  return `${userId}_${artefactId}`;
}
