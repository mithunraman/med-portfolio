/**
 * Discriminator for the polymorphic `entityType` field on version-history rows.
 * Keep in sync with the entities that opt into snapshot-before-edit history.
 */
export const VersionHistoryEntity = {
  ARTEFACT: 'artefact',
} as const;

export type VersionHistoryEntity =
  (typeof VersionHistoryEntity)[keyof typeof VersionHistoryEntity];
