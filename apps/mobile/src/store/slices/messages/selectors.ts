import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../index';
import type { OptimisticMessage } from './slice';
import { messageSelectors } from './slice';

// ── Base selectors (no memoization needed — direct field access) ──

const selectMessagesSlice = (state: RootState) => state.messages;

export const selectMessagesLoading = (state: RootState) => state.messages.loading;
export const selectMessagesSending = (state: RootState) => state.messages.sending;
export const selectAnalysisLoading = (state: RootState) => state.messages.analysisLoading;
export const selectAnalysisError = (state: RootState) => state.messages.analysisError;

export const selectContextByConversation = (state: RootState, conversationId: string) =>
  state.messages.contextByConversation[conversationId];

export const selectMessageIdsByConversation = (state: RootState, conversationId: string) =>
  state.messages.idsByConversation[conversationId];

// ── Memoized selectors ──

/**
 * Select server messages for a conversation.
 * Returns referentially stable array when the underlying message entities haven't changed.
 */
export const makeSelectServerMessages = () =>
  createSelector(
    [selectMessagesSlice, (_: RootState, conversationId: string) => conversationId],
    (messagesState, conversationId) => {
      const ids = messagesState.idsByConversation[conversationId] ?? [];
      return ids
        .map((id) => messageSelectors.selectById(messagesState, id))
        .filter(Boolean);
    },
  );

/**
 * Select optimistic messages for a conversation.
 * Returns referentially stable array when the optimistic record hasn't changed.
 */
export const makeSelectOptimisticMessages = () =>
  createSelector(
    [selectMessagesSlice, (_: RootState, conversationId: string) => conversationId],
    (messagesState, conversationId) =>
      Object.values(messagesState.optimisticMessages).filter(
        (m): m is OptimisticMessage => m != null && m.conversationId === conversationId,
      ),
  );
