import type { Conversation } from '@acme/shared';
import { createEntityAdapter, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { fetchConversations } from './thunks';

const conversationsAdapter = createEntityAdapter<Conversation>({
  // RTK uses the 'id' field automatically — no selectId needed
  sortComparer: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
});

interface ConversationsExtraState {
  loading: boolean;
  cursor: string | null;
  activeConversationId: string | null;
  error: string | null;
}

const initialState = conversationsAdapter.getInitialState<ConversationsExtraState>({
  loading: false,
  cursor: null,
  activeConversationId: null,
  error: null,
});

export type ConversationsState = typeof initialState;

const conversationsSlice = createSlice({
  name: 'conversations',
  initialState,
  reducers: {
    setActiveConversation(state, action: PayloadAction<string | null>) {
      state.activeConversationId = action.payload;
    },
    clearConversationsError(state) {
      state.error = null;
    },
    clearConversations(state) {
      conversationsAdapter.removeAll(state);
      state.cursor = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.loading = false;
        // Initial load replaces the list; paginated load merges
        if (!action.meta.arg?.cursor) {
          conversationsAdapter.setAll(state, action.payload.conversations);
        } else {
          conversationsAdapter.upsertMany(state, action.payload.conversations);
        }
        state.cursor = action.payload.nextCursor;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { setActiveConversation, clearConversationsError, clearConversations } =
  conversationsSlice.actions;

// Unbound selectors — pass the conversations slice state directly.
// Avoids circular deps with RootState.
// Usage: conversationSelectors.selectAll(useAppSelector(s => s.conversations))
export const conversationSelectors = conversationsAdapter.getSelectors();

export default conversationsSlice.reducer;
