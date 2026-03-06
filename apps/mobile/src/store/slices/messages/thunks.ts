import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';

const messagesLogger = logger.createScope('MessagesThunks');

/**
 * Fetch all messages + conversation context for a conversation.
 */
export const fetchMessages = createAsyncThunk(
  'messages/fetchMessages',
  async (params: { conversationId: string }, { rejectWithValue }) => {
    messagesLogger.info('Fetching messages', { conversationId: params.conversationId });

    try {
      const response = await api.conversations.listMessages(params.conversationId);
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
 * Unified poll: re-fetch the full message list + context for a conversation.
 * Runs silently — no loading state changes.
 */
export const pollConversation = createAsyncThunk(
  'messages/pollConversation',
  async (conversationId: string, { rejectWithValue }) => {
    try {
      const response = await api.conversations.listMessages(conversationId);
      return { conversationId, ...response };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to poll conversation';
      messagesLogger.error('Failed to poll conversation', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Start analysis for a conversation. Fire-and-forget — backend returns 204.
 */
export const startAnalysis = createAsyncThunk(
  'messages/startAnalysis',
  async (conversationId: string, { rejectWithValue }) => {
    messagesLogger.info('Starting analysis', { conversationId });
    try {
      await api.conversations.analysis(conversationId, { type: 'start' });
      return { conversationId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start analysis';
      messagesLogger.error('Failed to start analysis', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Resume analysis with a user response. Fire-and-forget — backend returns 204.
 */
export const resumeAnalysis = createAsyncThunk(
  'messages/resumeAnalysis',
  async (
    params: { conversationId: string; messageId: string; value?: Record<string, unknown> },
    { rejectWithValue }
  ) => {
    messagesLogger.info('Resuming analysis', params);
    try {
      await api.conversations.analysis(params.conversationId, {
        type: 'resume',
        messageId: params.messageId,
        value: params.value,
      });
      return { conversationId: params.conversationId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resume analysis';
      messagesLogger.error('Failed to resume analysis', { error: message });
      return rejectWithValue(message);
    }
  }
);
