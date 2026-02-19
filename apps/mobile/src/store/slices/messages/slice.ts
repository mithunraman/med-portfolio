import type { Message } from '@acme/shared';
import { createEntityAdapter, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { fetchMessages, sendMessage } from './thunks';

const messagesAdapter = createEntityAdapter<Message>({
  // RTK uses the 'id' field automatically — no selectId needed
  // Newest first — matches the inverted FlatList in GiftedChat
  sortComparer: (a, b) => b.createdAt.localeCompare(a.createdAt),
});

interface MessagesExtraState {
  // Ordered message IDs per conversation — the index for O(1) per-conversation lookups
  idsByConversation: Record<string, string[]>;
  // Per-conversation pagination cursors
  cursors: Record<string, string | null>;
  loading: boolean;
  sending: boolean;
  error: string | null;
}

const initialState = messagesAdapter.getInitialState<MessagesExtraState>({
  idsByConversation: {},
  cursors: {},
  loading: false,
  sending: false,
  error: null,
});

export type MessagesState = typeof initialState;

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    clearMessagesError(state) {
      state.error = null;
    },
    clearMessages(state) {
      messagesAdapter.removeAll(state);
      state.idsByConversation = {};
      state.cursors = {};
    },
    // Upsert a single message — used for real-time processingStatus updates.
    // If the message is new (not yet in the index), it is prepended as the newest.
    upsertMessage(state, action: PayloadAction<Message>) {
      const msg = action.payload;
      messagesAdapter.upsertOne(state, msg);
      const ids = state.idsByConversation[msg.conversationId];
      if (!ids) {
        state.idsByConversation[msg.conversationId] = [msg.id];
      } else if (!ids.includes(msg.id)) {
        state.idsByConversation[msg.conversationId] = [msg.id, ...ids];
      }
      // If the ID is already present, entity is updated in place — index unchanged ✓
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch messages
      .addCase(fetchMessages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.loading = false;
        const { conversationId, messages, nextCursor } = action.payload;
        const incomingIds = messages.map((m) => m.id);

        if (!action.meta.arg.cursor) {
          // Initial load — replace all messages and the index for this conversation
          const staleIds = state.ids.filter(
            (id) => state.entities[id]?.conversationId === conversationId
          );
          messagesAdapter.removeMany(state, staleIds);
          messagesAdapter.setMany(state, messages);
          // API returns newest-first; preserve that order in the index
          state.idsByConversation[conversationId] = incomingIds;
        } else {
          // Paginated load — incoming messages are older, append them to the end
          messagesAdapter.upsertMany(state, messages);
          state.idsByConversation[conversationId] = [
            ...(state.idsByConversation[conversationId] ?? []),
            ...incomingIds,
          ];
        }

        state.cursors[conversationId] = nextCursor;
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Send message
      .addCase(sendMessage.pending, (state) => {
        state.sending = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.sending = false;
        const msg = action.payload;
        messagesAdapter.upsertOne(state, msg);
        // Prepend — sent message is always the newest in the conversation
        const ids = state.idsByConversation[msg.conversationId] ?? [];
        state.idsByConversation[msg.conversationId] = [msg.id, ...ids];
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sending = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearMessagesError, clearMessages, upsertMessage } = messagesSlice.actions;

// Unbound selectors — pass the messages slice state directly.
// Avoids circular deps with RootState.
// Usage: messageSelectors.selectAll(useAppSelector(s => s.messages))
export const messageSelectors = messagesAdapter.getSelectors();

export default messagesSlice.reducer;
