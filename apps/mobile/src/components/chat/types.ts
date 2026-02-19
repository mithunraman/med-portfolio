import type { Message } from '@acme/shared';

export type FlatListItem =
  | { type: 'message'; data: Message; isLastInGroup: boolean; isFirstInGroup: boolean }
  | { type: 'dateSeparator'; date: string }
  | { type: 'notice'; text: string }
  | { type: 'typingIndicator' };

export type ContextMenuAction = 'react' | 'reply' | 'forward' | 'copy' | 'star' | 'delete';
