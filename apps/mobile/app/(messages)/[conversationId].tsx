import { ChatComposer, MessageList } from '@/components';
import { ActionBanner } from '@/components/ActionBanner';
import { CompletionCard } from '@/components/CompletionCard';
import { useAppDispatch, useAppSelector, useAuth } from '@/hooks';
import type { AudioRecordingResult } from '@/hooks/useAudioRecorder';
import {
  createArtefact,
  fetchMessages,
  pollConversation,
  resumeAnalysis,
  resumeAnalysisWithOptimistic,
  retryFailedMessage,
  sendMessageWithRetry,
  sendVoiceNoteWithRetry,
  startAnalysis,
} from '@/store';
import { type RenderableMessage, toRenderableMessage } from '@/store/slices/messages/slice';
import { useTheme } from '@/theme';
import { generateIdempotencyKey } from '@/utils/idempotency';
import { logger } from '@/utils/logger';
import {
  type Message,
  type MultiSelectQuestion,
  type SingleSelectQuestion,
  MessageProcessingStatus,
} from '@acme/shared';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shallowEqual } from 'react-redux';

// Stable empty array — prevents a new reference on every render for unseen conversations
const EMPTY_IDS: string[] = [];

const TERMINAL_STATUSES = new Set([
  MessageProcessingStatus.COMPLETE,
  MessageProcessingStatus.FAILED,
]);

// Phase-aware polling intervals (ms). null = no polling.
function getPollInterval(
  phase: string | undefined,
  hasProcessingMessages: boolean,
  hasOptimisticMessages: boolean
): number | null {
  // Messages still processing or optimistic messages pending — poll fast
  if (hasProcessingMessages || hasOptimisticMessages) return 3_000;

  switch (phase) {
    case 'analysing':
      return 2_000;
    case 'awaiting_input':
      return 10_000;
    case 'composing':
    case 'completed':
    case 'closed':
      return null;
    default:
      // No context yet (initial load) — poll at moderate rate to pick up context
      return 5_000;
  }
}

let localIdCounter = 0;
function generateLocalId(): string {
  return `opt_${Date.now()}_${++localIdCounter}`;
}

const chatLogger = logger.createScope('ChatScreen');

export default function ChatScreen() {
  const { conversationId, isNew } = useLocalSearchParams<{
    conversationId: string;
    isNew?: string;
  }>();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  // Track IDs from backend for new conversations.
  // State drives re-renders (selectors); ref provides stale-closure-safe access in callbacks.
  const [realConversationId, setRealConversationId] = useState<string | null>(null);
  const realConversationIdRef = useRef<string | null>(null);
  const artefactIdRef = useRef<string | null>(null);
  const isPendingConversation = isNew === 'true' && !realConversationId;
  // Use real conversation ID if available, otherwise use URL param
  const effectiveConversationId = realConversationId ?? conversationId ?? '';

  const loadingMessages = useAppSelector((state) => state.messages.loading);
  const sendingMessage = useAppSelector((state) => state.messages.sending);
  const analysisLoading = useAppSelector((state) => state.messages.analysisLoading);

  // Conversation context — server-driven action state
  const context = useAppSelector(
    (state) => state.messages.contextByConversation[effectiveConversationId]
  );

  // Artefact ID comes from the server-driven context (reliable across all flows)
  const artefactId = context?.artefactId ?? artefactIdRef.current;

  // Step 1: stable ID list — only changes when this conversation's message list changes
  const messageIds = useAppSelector(
    (state) => state.messages.idsByConversation[effectiveConversationId] ?? EMPTY_IDS
  );

  // Step 2: map IDs → entities — shallowEqual means re-render only when a message
  // object in THIS conversation changes, not when any other conversation is updated
  const serverMessages = useAppSelector(
    (state) => messageIds.map((id) => state.messages.entities[id]).filter(Boolean) as Message[],
    shallowEqual
  );

  // Optimistic messages for this conversation
  const optimisticMessages = useAppSelector((state) => {
    const all = state.messages.optimisticMessages;
    return Object.values(all).filter((m) => m.conversationId === effectiveConversationId);
  }, shallowEqual);

  // Merge server messages + optimistic messages, sorted newest first
  const mergedMessages: RenderableMessage[] = useMemo(() => {
    const optimisticRendered = optimisticMessages.map(toRenderableMessage);
    const all = [...(serverMessages as RenderableMessage[]), ...optimisticRendered];
    // Sort newest first (matches inverted FlatList)
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all;
  }, [serverMessages, optimisticMessages]);

  const hasUnsentMessages = optimisticMessages.length > 0;

  // Fetch messages for existing conversations (not newly created ones)
  useEffect(() => {
    if (conversationId && isNew !== 'true') {
      dispatch(fetchMessages({ conversationId }));
    }
  }, [conversationId, isNew, dispatch]);

  // Poll fast while any message is still being processed (transcription, cleaning, etc.)
  const hasProcessingMessages = serverMessages.some(
    (m) => !TERMINAL_STATUSES.has(m.processingStatus)
  );
  const pollIntervalMs = getPollInterval(context?.phase, hasProcessingMessages, hasUnsentMessages);

  useEffect(() => {
    if (!effectiveConversationId || isPendingConversation || pollIntervalMs === null) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        dispatch(pollConversation(effectiveConversationId));
      }, pollIntervalMs);
    };

    const stopPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    startPolling();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        dispatch(pollConversation(effectiveConversationId));
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      appStateSub.remove();
    };
  }, [effectiveConversationId, isPendingConversation, pollIntervalMs, dispatch]);

  const handleSendVoiceNote = useCallback(
    async (recording: AudioRecordingResult) => {
      if (!conversationId) return;

      // For new conversations, create artefact first
      let targetConversationId = realConversationIdRef.current;
      if (!targetConversationId && isNew === 'true') {
        try {
          const artefact = await dispatch(createArtefact({ artefactId: conversationId })).unwrap();
          targetConversationId = artefact.conversation.id;
          realConversationIdRef.current = targetConversationId;
          setRealConversationId(targetConversationId);
          artefactIdRef.current = artefact.id;
        } catch (error) {
          chatLogger.error('Failed to create conversation for voice note', { error });
          return;
        }
      }

      dispatch(
        sendVoiceNoteWithRetry({
          conversationId: targetConversationId ?? conversationId,
          localId: generateLocalId(),
          idempotencyKey: generateIdempotencyKey(),
          recordingUri: recording.uri,
          recordingMime: recording.mime,
        })
      );
    },
    [conversationId, isNew, dispatch]
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!conversationId || !text.trim()) return;

      // For new conversations, create artefact first to get real conversation ID
      let targetConversationId = effectiveConversationId;
      if (isPendingConversation) {
        try {
          const artefact = await dispatch(createArtefact({ artefactId: conversationId })).unwrap();
          targetConversationId = artefact.conversation.id;
          realConversationIdRef.current = targetConversationId;
          setRealConversationId(targetConversationId);
          artefactIdRef.current = artefact.id;
        } catch (error) {
          chatLogger.error('Failed to create conversation', { error });
          return;
        }
      }

      dispatch(
        sendMessageWithRetry({
          conversationId: targetConversationId,
          content: text.trim(),
          localId: generateLocalId(),
          idempotencyKey: generateIdempotencyKey(),
        })
      );
    },
    [conversationId, effectiveConversationId, isPendingConversation, dispatch]
  );

  const handleRetry = useCallback(
    (localId: string) => {
      const opt = optimisticMessages.find((m) => m.localId === localId);
      if (!opt || !opt.content) return;
      dispatch(
        retryFailedMessage({
          localId: opt.localId,
          conversationId: opt.conversationId,
          content: opt.content,
          idempotencyKey: opt.idempotencyKey,
        })
      );
    },
    [optimisticMessages, dispatch]
  );

  // Optimistic flag — bridges the gap between thunk resolve and poll update
  const [optimisticAnalysing, setOptimisticAnalysing] = useState(false);

  // Phase-aware flags derived from server context
  const canSendMessage = (context?.actions.sendMessage.allowed ?? true) && !optimisticAnalysing;
  const canSendAudio = (context?.actions.sendAudio.allowed ?? true) && !optimisticAnalysing;
  const canStartAnalysis = context?.actions.startAnalysis.allowed ?? false;
  const canResumeAnalysis = context?.actions.resumeAnalysis.allowed ?? false;
  const phase = context?.phase;

  // Action banner blocked state — disabled when messages are processing or unsent
  const isBannerBlocked = hasProcessingMessages || hasUnsentMessages;

  // Clear optimistic flag once backend confirms phase change
  useEffect(() => {
    if (phase && phase !== 'composing') {
      setOptimisticAnalysing(false);
    }
  }, [phase]);

  const handleStartAnalysis = useCallback(async () => {
    setOptimisticAnalysing(true);
    const result = await dispatch(startAnalysis(effectiveConversationId));
    if (startAnalysis.rejected.match(result)) {
      setOptimisticAnalysing(false);
    }
    dispatch(pollConversation(effectiveConversationId));
  }, [effectiveConversationId, dispatch]);

  const handleResumeAnalysis = useCallback(
    async (messageId?: string, value?: Record<string, unknown>) => {
      const msgId = messageId ?? context?.activeQuestion?.messageId;
      if (!msgId) return;
      setOptimisticAnalysing(true);
      const result = await dispatch(
        resumeAnalysis({
          conversationId: effectiveConversationId,
          messageId: msgId,
          value,
        })
      );
      if (resumeAnalysis.rejected.match(result)) {
        setOptimisticAnalysing(false);
      }
      dispatch(pollConversation(effectiveConversationId));
    },
    [effectiveConversationId, context?.activeQuestion?.messageId, dispatch]
  );

  const handleAnswerQuestion = useCallback(
    (messageId: string, value: Record<string, unknown>) => {
      // Find the question message to resolve option labels for the optimistic bubble
      const questionMessage = mergedMessages.find((m) => m.id === messageId);
      const question = questionMessage?.question;

      if (
        question &&
        (question.questionType === 'single_select' || question.questionType === 'multi_select')
      ) {
        let optimisticContent: string;

        if (question.questionType === 'single_select') {
          const q = question as SingleSelectQuestion;
          const selectedKey = value.selectedKey as string;
          const label = q.options.find((o) => o.key === selectedKey)?.label ?? selectedKey;
          optimisticContent = `Selected: ${label}`;
        } else {
          const q = question as MultiSelectQuestion;
          const selectedKeys = value.selectedKeys as string[];
          const labels = selectedKeys.map((k) => q.options.find((o) => o.key === k)?.label ?? k);
          optimisticContent = `Selected: ${labels.join(', ')}`;
        }

        setOptimisticAnalysing(true);
        dispatch(
          resumeAnalysisWithOptimistic({
            conversationId: effectiveConversationId,
            messageId,
            value,
            optimisticContent,
            localId: generateLocalId(),
            idempotencyKey: generateIdempotencyKey(),
          })
        ).then((result) => {
          if (resumeAnalysisWithOptimistic.rejected.match(result)) {
            setOptimisticAnalysing(false);
          }
          dispatch(pollConversation(effectiveConversationId));
        });
      } else {
        // Fallback for free_text or unknown question types — no optimistic bubble
        handleResumeAnalysis(messageId, value);
      }
    },
    [mergedMessages, effectiveConversationId, handleResumeAnalysis, dispatch]
  );

  // Single derived banner state — all visibility/loading/disabled logic in one place
  const bannerState = useMemo(() => {
    if (optimisticAnalysing || phase === 'analysing') {
      return {
        type: 'analyse' as const,
        loading: true,
        disabled: false,
        onPress: handleStartAnalysis,
      };
    }
    if (canStartAnalysis) {
      return {
        type: 'analyse' as const,
        loading: analysisLoading,
        disabled: isBannerBlocked,
        onPress: handleStartAnalysis,
      };
    }
    if (canResumeAnalysis && context?.activeQuestion?.questionType === 'free_text') {
      return {
        type: 'continue' as const,
        loading: analysisLoading,
        disabled: isBannerBlocked,
        onPress: () => handleResumeAnalysis(),
      };
    }
    return null;
  }, [
    optimisticAnalysing,
    phase,
    canStartAnalysis,
    canResumeAnalysis,
    analysisLoading,
    isBannerBlocked,
    context?.activeQuestion?.questionType,
    handleStartAnalysis,
    handleResumeAnalysis,
  ]);

  const activeQuestionMessageId = context?.activeQuestion?.messageId;

  const isLoading = loadingMessages && mergedMessages.length === 0 && isNew !== 'true';
  const composerBg = isDark ? colors.surface : colors.background;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <View style={phase === 'completed' ? styles.dimmed : styles.flex}>
          <MessageList
            messages={mergedMessages}
            currentUserId={user?.id ?? ''}
            isLoading={isLoading}
            activeQuestionMessageId={activeQuestionMessageId}
            onAnswerQuestion={handleAnswerQuestion}
            onRetry={handleRetry}
          />
        </View>

        {phase === 'completed' ? (
          <CompletionCard
            icon={<MaterialCommunityIcons name="party-popper" size={20} color="#ffffff" />}
            heading="All Done!"
            supportText="Your portfolio entry is ready for review"
            buttonIcon={<Feather name="file-text" size={18} color="#ffffff" />}
            buttonLabel="View Your Entry"
            onPress={() => {
              if (artefactId) {
                router.push(`/(entry)/${artefactId}`);
              }
            }}
          />
        ) : (
          <>
            {bannerState && (
              <ActionBanner
                variant={bannerState.type}
                onPress={bannerState.onPress}
                isLoading={bannerState.loading}
                disabled={bannerState.disabled}
                helperText="Waiting for messages to be delivered"
              />
            )}

            <ChatComposer
              onSend={handleSend}
              onSendVoiceNote={handleSendVoiceNote}
              isSending={sendingMessage}
              canSendMessage={canSendMessage}
              canSendAudio={canSendAudio}
              phase={optimisticAnalysing ? 'analysing' : phase}
            />
          </>
        )}
      </KeyboardAvoidingView>

      {/* Safe area spacer — keyboard covers this when open, visible when closed */}
      <View style={{ height: insets.bottom, backgroundColor: composerBg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  dimmed: {
    flex: 1,
    opacity: 0.4,
  },
});
