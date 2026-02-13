export enum MessageRole {
  USER = 1,
  ASSISTANT = 2,
}

export const MessageRoleLabels: Record<MessageRole, string> = {
  [MessageRole.USER]: 'User',
  [MessageRole.ASSISTANT]: 'Assistant',
};
