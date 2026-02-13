export enum ConversationStatus {
  ACTIVE = 1,
  ARCHIVED = 2,
}

export const ConversationStatusLabels: Record<ConversationStatus, string> = {
  [ConversationStatus.ACTIVE]: 'Active',
  [ConversationStatus.ARCHIVED]: 'Archived',
};
