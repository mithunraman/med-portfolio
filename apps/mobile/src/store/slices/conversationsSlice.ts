import type { Conversation, Message } from '@acme/shared';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { api } from '../../api/client';
import { logger } from '../../utils/logger';

const conversationsLogger = logger.createScope('ConversationsSlice');

export interface ConversationsState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  activeConversationId: string | null;
  loadingConversations: boolean;
  loadingMessages: boolean;
  sendingMessage: boolean;
  conversationsCursor: string | null;
  error: string | null;
}

const initialState: ConversationsState = {
  conversations: [],
  messages: {},
  activeConversationId: null,
  loadingConversations: false,
  loadingMessages: false,
  sendingMessage: false,
  conversationsCursor: null,
  error: null,
};

/**
 * Fetch conversations list with cursor-based pagination.
 */
export const fetchConversations = createAsyncThunk(
  'conversations/fetchConversations',
  async (params: { cursor?: string; limit?: number } | undefined, { rejectWithValue }) => {
    conversationsLogger.info('Fetching conversations', params);

    try {
      const response = await api.conversations.listConversations(params);
      conversationsLogger.info('Fetched conversations', { count: response.conversations.length });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch conversations';
      conversationsLogger.error('Failed to fetch conversations', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Fetch messages for a specific conversation.
 */
export const fetchMessages = createAsyncThunk(
  'conversations/fetchMessages',
  async (
    params: { conversationId: string; cursor?: string; limit?: number },
    { rejectWithValue }
  ) => {
    conversationsLogger.info('Fetching messages', { conversationId: params.conversationId });

    try {
      const response = await api.conversations.listMessages(params.conversationId, {
        cursor: params.cursor,
        limit: params.limit,
      });
      conversationsLogger.info('Fetched messages', {
        conversationId: params.conversationId,
        count: response.messages.length,
      });
      return { conversationId: params.conversationId, ...response };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch messages';
      conversationsLogger.error('Failed to fetch messages', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Send a message to a conversation.
 */
export const sendMessage = createAsyncThunk(
  'conversations/sendMessage',
  async (params: { conversationId: string; content: string }, { rejectWithValue }) => {
    conversationsLogger.info('Sending message', { conversationId: params.conversationId });

    try {
      const response = await api.conversations.sendMessage({
        conversationId: params.conversationId,
        content: params.content,
      });
      conversationsLogger.info('Message sent', { messageId: response.id });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message';
      conversationsLogger.error('Failed to send message', { error: message });
      return rejectWithValue(message);
    }
  }
);

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
      state.conversations = [];
      state.messages = {};
      state.conversationsCursor = null;
    },
    addOptimisticMessage(
      state,
      action: PayloadAction<{ conversationId: string; message: Message }>
    ) {
      const { conversationId, message } = action.payload;
      if (!state.messages[conversationId]) {
        state.messages[conversationId] = [];
      }
      state.messages[conversationId].unshift(message);
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch conversations
      .addCase(fetchConversations.pending, (state) => {
        state.loadingConversations = true;
        state.error = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.loadingConversations = false;
        // If no cursor was provided, replace the list; otherwise append
        if (!action.meta.arg?.cursor) {
          state.conversations = action.payload.conversations;
        } else {
          state.conversations = [...state.conversations, ...action.payload.conversations];
        }
        state.conversationsCursor = action.payload.nextCursor;
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.loadingConversations = false;
        state.error = action.payload as string;
      })

      // Fetch messages
      .addCase(fetchMessages.pending, (state) => {
        state.loadingMessages = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.loadingMessages = false;
        const { conversationId, messages } = action.payload;
        // If no cursor was provided, replace; otherwise prepend (older messages)
        if (!action.meta.arg.cursor) {
          state.messages[conversationId] = messages;
        } else {
          const existing = state.messages[conversationId] || [];
          state.messages[conversationId] = [...existing, ...messages];
        }
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.loadingMessages = false;
        state.error = action.payload as string;
      })

      // Send message
      .addCase(sendMessage.pending, (state) => {
        state.sendingMessage = true;
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.sendingMessage = false;
        const message = action.payload;
        const conversationId = message.conversationId;

        // Add message to the conversation
        if (!state.messages[conversationId]) {
          state.messages[conversationId] = [];
        }
        // Add to the beginning (newest first)
        state.messages[conversationId].unshift(message);
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.sendingMessage = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setActiveConversation,
  clearConversationsError,
  clearConversations,
  addOptimisticMessage,
} = conversationsSlice.actions;
export default conversationsSlice.reducer;
