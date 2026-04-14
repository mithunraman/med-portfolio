import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';
import { retryRead } from '../../../utils/retry';

const conversationsLogger = logger.createScope('ConversationsThunks');

/**
 * Delete a conversation and its associated artefact (only while IN_CONVERSATION).
 */
export const deleteConversation = createAsyncThunk(
  'conversations/deleteConversation',
  async (params: { conversationId: string }, { rejectWithValue }) => {
    conversationsLogger.info('Deleting conversation', { conversationId: params.conversationId });

    try {
      await api.conversations.deleteConversation(params.conversationId);
      conversationsLogger.info('Deleted conversation', { conversationId: params.conversationId });
      return params.conversationId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete conversation';
      conversationsLogger.error('Failed to delete conversation', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Fetch conversations list with cursor-based pagination.
 */
export const fetchConversations = createAsyncThunk(
  'conversations/fetchConversations',
  async (params: { cursor?: string; limit?: number } | undefined, { rejectWithValue }) => {
    conversationsLogger.info('Fetching conversations', params);

    try {
      const response = await retryRead(() => api.conversations.listConversations(params));
      conversationsLogger.info('Fetched conversations', { count: response.conversations.length });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch conversations';
      conversationsLogger.error('Failed to fetch conversations', { error: message });
      return rejectWithValue(message);
    }
  }
);
