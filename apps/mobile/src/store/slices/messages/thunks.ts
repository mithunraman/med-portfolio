import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';

const messagesLogger = logger.createScope('MessagesThunks');

/**
 * Fetch messages for a conversation with cursor-based pagination.
 */
export const fetchMessages = createAsyncThunk(
  'messages/fetchMessages',
  async (
    params: { conversationId: string; cursor?: string; limit?: number },
    { rejectWithValue }
  ) => {
    messagesLogger.info('Fetching messages', { conversationId: params.conversationId });

    try {
      const response = await api.conversations.listMessages(params.conversationId, {
        cursor: params.cursor,
        limit: params.limit,
      });
      messagesLogger.info('Fetched messages', {
        conversationId: params.conversationId,
        count: response.messages.length,
      });
      return { conversationId: params.conversationId, ...response };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch messages';
      messagesLogger.error('Failed to fetch messages', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Send a message to a conversation. Accepts either text content or a mediaId (voice note).
 */
export const sendMessage = createAsyncThunk(
  'messages/sendMessage',
  async (
    params: { conversationId: string } & (
      | { content: string; mediaId?: never }
      | { mediaId: string; content?: never }
    ),
    { rejectWithValue }
  ) => {
    messagesLogger.info('Sending message', { conversationId: params.conversationId });

    try {
      const body = params.mediaId ? { mediaId: params.mediaId } : { content: params.content };
      const response = await api.conversations.sendMessage(params.conversationId, body);
      messagesLogger.info('Message sent', { messageId: response.id });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message';
      messagesLogger.error('Failed to send message', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Poll a batch of pending messages by XID and return their latest state.
 * Called on a polling interval while any messages have non-terminal processing status.
 */
export const pollMessages = createAsyncThunk(
  'messages/pollMessages',
  async (ids: string[], { rejectWithValue }) => {
    try {
      return await api.conversations.pollPendingMessages(ids);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to poll messages';
      messagesLogger.error('Failed to poll messages', { error: message });
      return rejectWithValue(message);
    }
  }
);
