import type { Message } from '@acme/shared';
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

/**
 * Select the most recent readiness snapshot for a conversation.
 *
 * The backend rides the live readiness payload on each question message
 * (`question.readiness`). We pick the snapshot from the latest message
 * (by createdAt) that carries one — robust to server ordering. Returns
 * null until the first readiness-bearing question arrives.
 */
export const makeSelectLatestReadiness = () =>
  createSelector(
    [selectMessagesSlice, (_: RootState, conversationId: string) => conversationId],
    (messagesState, conversationId) => {
      const ids = messagesState.idsByConversation[conversationId] ?? [];
      let latest: Message | undefined;
      for (const id of ids) {
        const msg = messageSelectors.selectById(messagesState, id);
        if (!msg?.question?.readiness) continue;
        if (!latest || msg.createdAt.localeCompare(latest.createdAt) > 0) {
          latest = msg;
        }
      }
      return latest?.question?.readiness ?? null;
    },
  );
