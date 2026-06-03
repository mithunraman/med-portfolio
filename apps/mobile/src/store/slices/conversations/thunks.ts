import { createAsyncThunk } from '@reduxjs/toolkit';
import { ApiError } from '@acme/api-client';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';
import { retryRead } from '../../../utils/retry';

const conversationsLogger = logger.createScope('ConversationsThunks');

/**
 * Delete a conversation's entry. The dedicated conversation-delete endpoint was
 * removed; deleting the parent artefact cascades to its conversation, messages,
 * and PDP goals server-side. Returns the conversationId so the cross-slice
 * `deleteConversation.fulfilled` reducers can prune their local state.
 */
export const deleteConversation = createAsyncThunk(
  'conversations/deleteConversation',
  async (params: { conversationId: string; artefactId: string }, { rejectWithValue }) => {
    conversationsLogger.info('Deleting conversation entry', {
      conversationId: params.conversationId,
      artefactId: params.artefactId,
    });

    try {
      await api.artefacts.deleteArtefact(params.artefactId);
      conversationsLogger.info('Deleted conversation entry', {
        conversationId: params.conversationId,
      });
      return params.conversationId;
    } catch (error) {
      // 409 = an analysis run is still in flight; the entry can't be deleted yet.
      const message =
        error instanceof ApiError && error.status === 409
          ? "This entry is still being analysed and can't be deleted yet. Please try again once analysis finishes."
          : 'Failed to delete conversation. Please try again.';
      conversationsLogger.error('Failed to delete conversation entry', {
        conversationId: params.conversationId,
        status: error instanceof ApiError ? error.status : undefined,
        error: error instanceof Error ? error.message : String(error),
      });
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
