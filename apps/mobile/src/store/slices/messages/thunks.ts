import { MediaType, MessageType } from '@acme/shared';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';
import { retryWrite } from '../../../utils/retry';
import {
  addOptimisticMessage,
  updateOptimisticStatus,
  type OptimisticMessage,
} from './slice';

const messagesLogger = logger.createScope('MessagesThunks');

// ── Shared helper ──

interface EnsureConversationResult {
  conversationId: string;
  artefactXid?: string;
}

/**
 * If this is a new conversation, create the artefact to get the real conversation ID.
 * Does NOT rekey optimistic messages — the caller (screen) must dispatch
 * rekeyOptimisticMessages in the same synchronous block as setRealConversationId
 * to avoid an empty-state flash between renders.
 */
async function ensureConversation(
  conversationId: string,
  isNewConversation?: boolean,
  artefactId?: string,
): Promise<EnsureConversationResult> {
  if (!isNewConversation || !artefactId) {
    return { conversationId };
  }

  const artefact = await api.artefacts.createArtefact({ artefactId });
  return { conversationId: artefact.conversation.id, artefactXid: artefact.id };
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
 * 1. Dispatch optimistic message INSTANTLY (before any network call)
 * 2. If new conversation, create artefact to get real conversation ID
 * 3. POST to server with retry (exponential backoff + jitter)
 * 4. On success: optimistic message removed via poll reconciliation
 * 5. On final failure: mark optimistic message as 'failed' for tap-to-retry
 */
export const sendMessageWithRetry = createAsyncThunk(
  'messages/sendMessageWithRetry',
  async (
    params: {
      conversationId: string;
      content: string;
      localId: string;
      idempotencyKey: string;
      isNewConversation?: boolean;
      artefactId?: string;
    },
    { dispatch, rejectWithValue }
  ) => {
    const { content, localId, idempotencyKey, isNewConversation, artefactId } = params;
    let { conversationId } = params;

    // 1. Optimistic message — INSTANT, before any network call
    const optimistic: OptimisticMessage = {
      localId,
      conversationId,
      content,
      mediaId: null,
      messageType: MessageType.TEXT,
      deliveryStatus: 'sending',
      idempotencyKey,
      createdAt: new Date().toISOString(),
      isNewConversation,
      artefactId,
    };
    dispatch(addOptimisticMessage(optimistic));

    // 2. New conversation? Create artefact to get real conversation ID
    try {
      const result = await ensureConversation(conversationId, isNewConversation, artefactId);
      conversationId = result.conversationId;

      // 3. Send with retry
      const response = await retryWrite(() => {
        const body = { content, idempotencyKey };
        return api.conversations.sendMessage(conversationId, body);
      });
      messagesLogger.info('Message sent (with retry)', { messageId: response.id });
      return { response, conversationId, artefactXid: result.artefactXid };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to send message';
      messagesLogger.error('Message send failed after retries', { localId, error: errorMsg });
      dispatch(updateOptimisticStatus({ localId, status: 'failed', error: errorMsg }));
      return rejectWithValue(errorMsg);
    }
  }
);

/**
 * Retry a failed optimistic message. Reuses the same idempotencyKey.
 * Handles both cases: failure during artefact creation and failure during send.
 */
export const retryFailedMessage = createAsyncThunk(
  'messages/retryFailedMessage',
  async (
    params: {
      localId: string;
      conversationId: string;
      content: string;
      idempotencyKey: string;
      isNewConversation?: boolean;
      artefactId?: string;
    },
    { dispatch, rejectWithValue }
  ) => {
    const { localId, content, idempotencyKey, isNewConversation, artefactId } = params;
    let { conversationId } = params;

    // Reset status to sending
    dispatch(updateOptimisticStatus({ localId, status: 'sending' }));

    try {
      // Re-attempt artefact creation if it failed previously
      const result = await ensureConversation(conversationId, isNewConversation, artefactId);
      conversationId = result.conversationId;

      const response = await retryWrite(() => {
        const body = { content, idempotencyKey };
        return api.conversations.sendMessage(conversationId, body);
      });
      messagesLogger.info('Retry succeeded', { messageId: response.id });
      return { response, conversationId, artefactXid: result.artefactXid };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to send message';
      dispatch(updateOptimisticStatus({ localId, status: 'failed', error: errorMsg }));
      return rejectWithValue(errorMsg);
    }
  }
);

/**
 * Send a voice note with optimistic UI and retry.
 *
 * Flow:
 * 1. Dispatch optimistic bubble INSTANTLY (before any network call)
 * 2. If new conversation, create artefact to get real conversation ID
 * 3. Upload to S3 via presigned URL
 * 4. POST to server with retry
 * 5. On failure at any step: mark failed
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
      isNewConversation?: boolean;
      artefactId?: string;
    },
    { dispatch, rejectWithValue }
  ) => {
    const { localId, idempotencyKey, recordingUri, recordingMime, isNewConversation, artefactId } =
      params;
    let { conversationId } = params;

    // 1. Optimistic bubble — INSTANT, before any network call
    const optimistic: OptimisticMessage = {
      localId,
      conversationId,
      content: null,
      mediaId: null,
      messageType: MessageType.AUDIO,
      deliveryStatus: 'sending',
      idempotencyKey,
      createdAt: new Date().toISOString(),
      recordingUri,
      recordingMime,
      isNewConversation,
      artefactId,
    };
    dispatch(addOptimisticMessage(optimistic));

    // 2. New conversation? Create artefact to get real conversation ID
    try {
      const result = await ensureConversation(conversationId, isNewConversation, artefactId);
      conversationId = result.conversationId;

      // 3. Upload + send with retry
      const response = await retryWrite(async () => {
        // Initiate upload + S3 PUT (re-done on each retry in case presigned URL expired)
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

        // Send message with mediaId
        const body = { mediaId, idempotencyKey };
        return api.conversations.sendMessage(conversationId, body);
      });
      messagesLogger.info('Voice note sent', { messageId: response.id });
      return { response, conversationId, artefactXid: result.artefactXid };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to send voice note';
      messagesLogger.error('Voice note send failed after retries', { localId, error: errorMsg });
      dispatch(updateOptimisticStatus({ localId, status: 'failed', error: errorMsg }));
      return rejectWithValue(errorMsg);
    }
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
      messageType: MessageType.TEXT,
      deliveryStatus: 'sending',
      idempotencyKey,
      createdAt: new Date().toISOString(),
    };
    dispatch(addOptimisticMessage(optimistic));

    try {
      const context = await retryWrite(() =>
        api.conversations.analysis(conversationId, {
          type: 'resume',
          messageId,
          value: { ...value, idempotencyKey },
        })
      );
      messagesLogger.info('Resume analysis succeeded', { conversationId });
      return { conversationId, context };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to resume analysis';
      messagesLogger.error('Resume analysis failed after retries', { localId, error: errorMsg });
      dispatch(updateOptimisticStatus({ localId, status: 'failed', error: errorMsg }));
      return rejectWithValue(errorMsg);
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
