import type { Message } from '@acme/shared';
import type { StatusVariant } from '../../theme/statusColors';

export type FlatListItem =
  | { type: 'message'; data: Message; isLastInGroup: boolean; isFirstInGroup: boolean }
  | { type: 'dateSeparator'; date: string }
  // `variant` is the shared status vocabulary, not a chat-local one — the app
  // already had StatusVariant and NoticeSeverity, and a third two-value tone
  // type bought nothing.
  | { type: 'notice'; text: string; variant: StatusVariant }
  | { type: 'typingIndicator' };

export type ContextMenuAction = 'react' | 'reply' | 'forward' | 'copy' | 'star' | 'delete' | 'edit';
