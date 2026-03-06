import type { ConversationContext, Message } from '@acme/shared';
import { createEntityAdapter, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  fetchMessages,
  pollConversation,
  resumeAnalysis,
  sendMessage,
  startAnalysis,
} from './thunks';

const messagesAdapter = createEntityAdapter<Message>({
  // RTK uses the 'id' field automatically — no selectId needed
  // Newest first — matches the inverted FlatList in GiftedChat
  sortComparer: (a, b) => b.createdAt.localeCompare(a.createdAt),
});

interface MessagesExtraState {
  // Ordered message IDs per conversation — the index for O(1) per-conversation lookups
  idsByConversation: Record<string, string[]>;
  // Server-driven conversation context per conversation
  contextByConversation: Record<string, ConversationContext>;
  loading: boolean;
  sending: boolean;
  analysisLoading: boolean;
  analysisError: string | null;
  error: string | null;
}

const initialState = messagesAdapter.getInitialState<MessagesExtraState>({
  idsByConversation: {},
  contextByConversation: {},
  loading: false,
  sending: false,
  analysisLoading: false,
  analysisError: null,
  error: null,
});

export type MessagesState = typeof initialState;

/**
 * Full-replace messages + context for a conversation.
 * Used by both fetchMessages and pollConversation.
 */
function replaceConversationMessages(
  state: MessagesState,
  conversationId: string,
  messages: Message[],
  context: ConversationContext,
) {
  const staleIds = state.ids.filter(
    (id) => state.entities[id]?.conversationId === conversationId,
  );
  messagesAdapter.removeMany(state, staleIds);
  messagesAdapter.setMany(state, messages);
  state.idsByConversation[conversationId] = messages.map((m) => m.id);
  state.contextByConversation[conversationId] = context;
}

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    clearMessagesError(state) {
      state.error = null;
    },
    clearAnalysisError(state) {
      state.analysisError = null;
    },
    clearMessages(state) {
      messagesAdapter.removeAll(state);
      state.idsByConversation = {};
      state.contextByConversation = {};
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
        const { conversationId, messages, context } = action.payload;
        replaceConversationMessages(state, conversationId, messages, context);
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
      })

      // Poll conversation — silently replace messages + context (no loading state)
      .addCase(pollConversation.fulfilled, (state, action) => {
        const { conversationId, messages, context } = action.payload;
        replaceConversationMessages(state, conversationId, messages, context);
      })

      // Start analysis
      .addCase(startAnalysis.pending, (state) => {
        state.analysisLoading = true;
        state.analysisError = null;
      })
      .addCase(startAnalysis.fulfilled, (state) => {
        state.analysisLoading = false;
      })
      .addCase(startAnalysis.rejected, (state, action) => {
        state.analysisLoading = false;
        state.analysisError = action.payload as string;
      })

      // Resume analysis
      .addCase(resumeAnalysis.pending, (state) => {
        state.analysisLoading = true;
        state.analysisError = null;
      })
      .addCase(resumeAnalysis.fulfilled, (state) => {
        state.analysisLoading = false;
      })
      .addCase(resumeAnalysis.rejected, (state, action) => {
        state.analysisLoading = false;
        state.analysisError = action.payload as string;
      });
  },
});

export const { clearMessagesError, clearAnalysisError, clearMessages, upsertMessage } =
  messagesSlice.actions;

// Unbound selectors — pass the messages slice state directly.
// Avoids circular deps with RootState.
// Usage: messageSelectors.selectAll(useAppSelector(s => s.messages))
export const messageSelectors = messagesAdapter.getSelectors();

export default messagesSlice.reducer;
