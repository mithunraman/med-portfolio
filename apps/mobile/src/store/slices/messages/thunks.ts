import { createAsyncThunk } from '@reduxjs/toolkit';
import { ApiError, NetworkError } from '@acme/api-client';
import { MediaType } from '@acme/shared';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';
import {
  addOptimisticMessage,
  updateOptimisticStatus,
  type OptimisticMessage,
} from './slice';

const messagesLogger = logger.createScope('MessagesThunks');

// ── Retry helpers ──

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 5000;
const JITTER_MAX_MS = 500;

function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }
  return false;
}

function getRetryDelay(attempt: number): number {
  const exponential = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  const jitter = Math.random() * JITTER_MAX_MS;
  return exponential + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Send a text message with optimistic UI and automatic retry on transient failures.
 *
 * Flow:
 * 1. Generate localId + idempotencyKey, dispatch optimistic message immediately
 * 2. POST to server with retry loop (exponential backoff + jitter)
 * 3. On success: remove optimistic message (server message appears via next poll)
 * 4. On final failure: mark optimistic message as 'failed' for tap-to-retry
 */
export const sendMessageWithRetry = createAsyncThunk(
  'messages/sendMessageWithRetry',
  async (
    params: {
      conversationId: string;
      content: string;
      localId: string;
      idempotencyKey: string;
    },
    { dispatch, rejectWithValue }
  ) => {
    const { conversationId, content, localId, idempotencyKey } = params;

    // 1. Add optimistic message to the store
    const optimistic: OptimisticMessage = {
      localId,
      conversationId,
      content,
      mediaId: null,
      deliveryStatus: 'sending',
      idempotencyKey,
      createdAt: new Date().toISOString(),
    };
    dispatch(addOptimisticMessage(optimistic));

    // 2. Retry loop
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const body = { content, idempotencyKey };
        const response = await api.conversations.sendMessage(conversationId, body);
        messagesLogger.info('Message sent (with retry)', {
          messageId: response.id,
          attempt,
        });

        // 3. Success — keep optimistic entry visible until poll brings the
        //    server message and reconciliation removes it via idempotencyKey.
        return response;
      } catch (error) {
        lastError = error;

        // Non-retryable error — fail immediately
        if (!isRetryableError(error)) {
          messagesLogger.error('Non-retryable error, failing immediately', {
            error: error instanceof Error ? error.message : 'Unknown',
          });
          break;
        }

        // Last attempt — don't sleep, fall through to failure
        if (attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt);
          messagesLogger.info(`Retry attempt ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`);
          await sleep(delay);
        }
      }
    }

    // 4. All retries exhausted or non-retryable error
    const errorMsg = lastError instanceof Error ? lastError.message : 'Failed to send message';
    messagesLogger.error('Message send failed after retries', { localId, error: errorMsg });
    dispatch(updateOptimisticStatus({ localId, status: 'failed', error: errorMsg }));
    return rejectWithValue(errorMsg);
  }
);

/**
 * Retry a failed optimistic message. Reuses the same idempotencyKey.
 */
export const retryFailedMessage = createAsyncThunk(
  'messages/retryFailedMessage',
  async (
    params: { localId: string; conversationId: string; content: string; idempotencyKey: string },
    { dispatch, rejectWithValue }
  ) => {
    const { localId, conversationId, content, idempotencyKey } = params;

    // Reset status to sending
    dispatch(updateOptimisticStatus({ localId, status: 'sending' }));

    // Retry loop (same as sendMessageWithRetry)
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const body = { content, idempotencyKey };
        const response = await api.conversations.sendMessage(conversationId, body);
        messagesLogger.info('Retry succeeded', { messageId: response.id, attempt });
        // Keep optimistic entry — poll reconciliation removes it via idempotencyKey
        return response;
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error)) break;
        if (attempt < MAX_RETRIES) {
          await sleep(getRetryDelay(attempt));
        }
      }
    }

    const errorMsg = lastError instanceof Error ? lastError.message : 'Failed to send message';
    dispatch(updateOptimisticStatus({ localId, status: 'failed', error: errorMsg }));
    return rejectWithValue(errorMsg);
  }
);

/**
 * Send a voice note with optimistic UI and retry.
 *
 * Flow:
 * 1. Add optimistic bubble immediately (before S3 upload)
 * 2. Upload to S3 via presigned URL
 * 3. POST to server with retry loop
 * 4. On failure at any step: mark failed
 */
export const sendVoiceNoteWithRetry = createAsyncThunk(
  'messages/sendVoiceNoteWithRetry',
  async (
    params: {
      conversationId: string;
      localId: string;
      idempotencyKey: string;
      recordingUri: string;
      recordingMime: string;
    },
    { dispatch, rejectWithValue }
  ) => {
    const { conversationId, localId, idempotencyKey, recordingUri, recordingMime } = params;

    // 1. Optimistic bubble
    const optimistic: OptimisticMessage = {
      localId,
      conversationId,
      content: null,
      mediaId: null,
      deliveryStatus: 'sending',
      idempotencyKey,
      createdAt: new Date().toISOString(),
      recordingUri,
      recordingMime,
    };
    dispatch(addOptimisticMessage(optimistic));

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // 2. Initiate upload + S3 PUT (re-done on each retry in case presigned URL expired)
        const { mediaId, uploadUrl } = await api.media.initiateUpload({
          mediaType: MediaType.AUDIO,
          mimeType: recordingMime,
        });

        const fileResponse = await fetch(recordingUri);
        const blob = await fileResponse.blob();
        await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': recordingMime },
          body: blob,
        });

        // 3. Send message with mediaId
        const body = { mediaId, idempotencyKey };
        const response = await api.conversations.sendMessage(conversationId, body);
        messagesLogger.info('Voice note sent', { messageId: response.id, attempt });
        // Keep optimistic entry — poll reconciliation removes it via idempotencyKey
        return response;
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error) && !(error instanceof TypeError)) break;
        if (attempt < MAX_RETRIES) {
          await sleep(getRetryDelay(attempt));
        }
      }
    }

    const errorMsg = lastError instanceof Error ? lastError.message : 'Failed to send voice note';
    messagesLogger.error('Voice note send failed after retries', { localId, error: errorMsg });
    dispatch(updateOptimisticStatus({ localId, status: 'failed', error: errorMsg }));
    return rejectWithValue(errorMsg);
  }
);

/**
 * Resume analysis with an optimistic "Selected: ..." message for question answers.
 *
 * For single_select/multi_select: creates an optimistic USER bubble, then calls
 * the analysis resume endpoint. The optimistic message stays until the poll
 * returns a server message with a matching idempotencyKey.
 */
export const resumeAnalysisWithOptimistic = createAsyncThunk(
  'messages/resumeAnalysisWithOptimistic',
  async (
    params: {
      conversationId: string;
      messageId: string;
      value: Record<string, unknown>;
      optimisticContent: string;
      localId: string;
      idempotencyKey: string;
    },
    { dispatch, rejectWithValue }
  ) => {
    const { conversationId, messageId, value, optimisticContent, localId, idempotencyKey } = params;

    // Add optimistic "Selected: ..." bubble
    const optimistic: OptimisticMessage = {
      localId,
      conversationId,
      content: optimisticContent,
      mediaId: null,
      deliveryStatus: 'sending',
      idempotencyKey,
      createdAt: new Date().toISOString(),
    };
    dispatch(addOptimisticMessage(optimistic));

    // Retry loop for the resume call
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const context = await api.conversations.analysis(conversationId, {
          type: 'resume',
          messageId,
          value: { ...value, idempotencyKey },
        });
        messagesLogger.info('Resume analysis succeeded', { conversationId, attempt });

        // Don't remove optimistic — wait for poll to bring the server message
        // Just mark delivery as successful by keeping status as 'sending'
        // The poll reconciliation will remove it when server message arrives
        return { conversationId, context };
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error)) break;
        if (attempt < MAX_RETRIES) {
          await sleep(getRetryDelay(attempt));
        }
      }
    }

    const errorMsg = lastError instanceof Error ? lastError.message : 'Failed to resume analysis';
    messagesLogger.error('Resume analysis failed after retries', { localId, error: errorMsg });
    dispatch(updateOptimisticStatus({ localId, status: 'failed', error: errorMsg }));
    return rejectWithValue(errorMsg);
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
 * Start analysis for a conversation. Returns the updated ConversationContext
 * so the client can apply the new phase immediately without polling.
 */
export const startAnalysis = createAsyncThunk(
  'messages/startAnalysis',
  async (conversationId: string, { rejectWithValue }) => {
    messagesLogger.info('Starting analysis', { conversationId });
    try {
      const context = await api.conversations.analysis(conversationId, { type: 'start' });
      return { conversationId, context };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start analysis';
      messagesLogger.error('Failed to start analysis', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Resume analysis with a user response. Returns the updated ConversationContext
 * so the client can apply the new phase immediately without polling.
 */
export const resumeAnalysis = createAsyncThunk(
  'messages/resumeAnalysis',
  async (
    params: { conversationId: string; messageId: string; value?: Record<string, unknown> },
    { rejectWithValue }
  ) => {
    messagesLogger.info('Resuming analysis', params);
    try {
      const context = await api.conversations.analysis(params.conversationId, {
        type: 'resume',
        messageId: params.messageId,
        value: params.value,
      });
      return { conversationId: params.conversationId, context };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resume analysis';
      messagesLogger.error('Failed to resume analysis', { error: message });
      return rejectWithValue(message);
    }
  }
);
