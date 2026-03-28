import type { ConversationContext, Message } from '@acme/shared';
import { MessageRole, MessageStatus, MessageType } from '@acme/shared';
import { createEntityAdapter, createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  fetchMessages,
  pollConversation,
  resumeAnalysis,
  resumeAnalysisWithOptimistic,
  sendMessage,
  startAnalysis,
} from './thunks';

const messagesAdapter = createEntityAdapter<Message>({
  // RTK uses the 'id' field automatically — no selectId needed
  // Newest first — matches the inverted FlatList in GiftedChat
  sortComparer: (a, b) => b.createdAt.localeCompare(a.createdAt),
});

// ── Optimistic message types ──

export type DeliveryStatus = 'sending' | 'failed';

export interface OptimisticMessage {
  localId: string;
  conversationId: string;
  content: string | null;
  mediaId: string | null;
  /** Explicit type so the renderer never has to guess from mediaId */
  messageType: MessageType;
  deliveryStatus: DeliveryStatus;
  idempotencyKey: string;
  createdAt: string;
  error?: string;
  /** For voice notes — local recording URI for retry */
  recordingUri?: string;
  recordingMime?: string;
  /** For retry — if the artefact was never created, retry needs these to re-attempt */
  isNewConversation?: boolean;
  artefactId?: string;
}

/**
 * Shape an optimistic message as a Message so it can be rendered by MessageRow/BubbleShell.
 * The `_deliveryStatus` field is a client-only extension for rendering the clock/failed icon.
 */
export type RenderableMessage = Message & { _deliveryStatus?: DeliveryStatus; _localId?: string };

export function toRenderableMessage(opt: OptimisticMessage): RenderableMessage {
  return {
    id: opt.localId,
    conversationId: opt.conversationId,
    role: MessageRole.USER,
    messageType: opt.messageType,
    status: MessageStatus.PENDING,
    content: opt.content,
    media: null,
    question: null,
    answer: null,
    createdAt: opt.createdAt,
    updatedAt: opt.createdAt,
    _deliveryStatus: opt.deliveryStatus,
    _localId: opt.localId,
  };
}

interface MessagesExtraState {
  // Ordered message IDs per conversation — the index for O(1) per-conversation lookups
  idsByConversation: Record<string, string[]>;
  // Server-driven conversation context per conversation
  contextByConversation: Record<string, ConversationContext>;
  // Optimistic messages awaiting server confirmation, keyed by localId
  optimisticMessages: Record<string, OptimisticMessage>;
  loading: boolean;
  sending: boolean;
  analysisLoading: boolean;
  analysisError: string | null;
  error: string | null;
}

const initialState = messagesAdapter.getInitialState<MessagesExtraState>({
  idsByConversation: {},
  contextByConversation: {},
  optimisticMessages: {},
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
 *
 * Also reconciles optimistic messages: if a server message carries an
 * idempotencyKey matching an optimistic entry, the optimistic entry is removed.
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

  // Reconcile: remove optimistic messages that the server has confirmed.
  // Match by idempotencyKey if available, or by content + createdAt proximity.
  const serverKeys = new Set(
    messages
      .map((m) => (m as RenderableMessage & { idempotencyKey?: string }).idempotencyKey)
      .filter(Boolean) as string[],
  );

  for (const [localId, opt] of Object.entries(state.optimisticMessages)) {
    if (opt.conversationId !== conversationId) continue;
    if (serverKeys.has(opt.idempotencyKey)) {
      delete state.optimisticMessages[localId];
    }
  }
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
    // Upsert a single message — used for real-time status updates.
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

    // ── Optimistic message management ──

    addOptimisticMessage(state, action: PayloadAction<OptimisticMessage>) {
      state.optimisticMessages[action.payload.localId] = action.payload;
    },
    updateOptimisticStatus(
      state,
      action: PayloadAction<{ localId: string; status: DeliveryStatus; error?: string }>,
    ) {
      const opt = state.optimisticMessages[action.payload.localId];
      if (opt) {
        opt.deliveryStatus = action.payload.status;
        opt.error = action.payload.error;
      }
    },
    removeOptimisticMessage(state, action: PayloadAction<string>) {
      delete state.optimisticMessages[action.payload];
    },
    /**
     * Re-key ALL optimistic messages from one conversationId to another.
     * Used when a new conversation is created — optimistic messages were keyed to a
     * temporary ID and need to switch to the real server-assigned ID.
     *
     * Must be dispatched in the same synchronous block as setRealConversationId
     * so React batches both into one render (avoids empty-state flash).
     */
    rekeyOptimisticMessages(
      state,
      action: PayloadAction<{ oldConversationId: string; newConversationId: string }>,
    ) {
      const { oldConversationId, newConversationId } = action.payload;
      for (const opt of Object.values(state.optimisticMessages)) {
        if (opt && opt.conversationId === oldConversationId) {
          opt.conversationId = newConversationId;
          // Artefact was created — clear flags so retry doesn't re-create
          opt.isNewConversation = undefined;
          opt.artefactId = undefined;
        }
      }
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
      .addCase(startAnalysis.fulfilled, (state, action) => {
        state.analysisLoading = false;
        const { conversationId, context } = action.payload;
        state.contextByConversation[conversationId] = context;
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
      .addCase(resumeAnalysis.fulfilled, (state, action) => {
        state.analysisLoading = false;
        const { conversationId, context } = action.payload;
        state.contextByConversation[conversationId] = context;
      })
      .addCase(resumeAnalysis.rejected, (state, action) => {
        state.analysisLoading = false;
        state.analysisError = action.payload as string;
      })

      // Resume analysis with optimistic bubble
      .addCase(resumeAnalysisWithOptimistic.fulfilled, (state, action) => {
        const { conversationId, context } = action.payload;
        state.contextByConversation[conversationId] = context;
      });
  },
});

export const {
  clearMessagesError,
  clearAnalysisError,
  clearMessages,
  upsertMessage,
  addOptimisticMessage,
  updateOptimisticStatus,
  removeOptimisticMessage,
  rekeyOptimisticMessages,
} = messagesSlice.actions;

// Unbound selectors — pass the messages slice state directly.
// Avoids circular deps with RootState.
// Usage: messageSelectors.selectAll(useAppSelector(s => s.messages))
export const messageSelectors = messagesAdapter.getSelectors();

export default messagesSlice.reducer;
