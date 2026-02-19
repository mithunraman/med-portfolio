import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';

const conversationsLogger = logger.createScope('ConversationsThunks');

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
