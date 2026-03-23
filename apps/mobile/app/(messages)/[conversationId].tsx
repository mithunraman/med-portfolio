import { ChatComposer, MessageList } from '@/components';
import { type ActionBarState, ActionBar } from '@/components/ActionBar';
import { ChatEmptyState } from '@/components/ChatEmptyState';
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
import {
  makeSelectOptimisticMessages,
  makeSelectServerMessages,
  selectContextByConversation,
  selectMessagesLoading,
  selectMessagesSending,
} from '@/store/slices/messages/selectors';
import { useTheme } from '@/theme';
import { generateIdempotencyKey } from '@/utils/idempotency';
import { logger } from '@/utils/logger';
import {
  type Message,
  type MultiSelectQuestion,
  type SingleSelectQuestion,
  MessageProcessingStatus,
  MessageRole,
  ThinkingStep,
} from '@acme/shared';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
/** Minimum user words before "Start Analysis" is available */
const INITIAL_WORD_THRESHOLD = 60;
/** Minimum user words (since the question) before "Continue Analysis" is available */
const FOLLOWUP_WORD_THRESHOLD = 30;

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

const THINKING_STEP_LABELS: Record<string, string> = {
  [ThinkingStep.GATHER_CONTEXT]: 'Gathering context...',
  [ThinkingStep.CLASSIFY]: 'Classifying entry...',
  [ThinkingStep.PRESENT_CLASSIFICATION]: 'Reviewing classification...',
  [ThinkingStep.ASK_FOLLOWUP]: 'Preparing questions...',
  [ThinkingStep.TAG_CAPABILITIES]: 'Identifying capabilities...',
  [ThinkingStep.PRESENT_CAPABILITIES]: 'Reviewing capabilities...',
  [ThinkingStep.CHECK_COMPLETENESS]: 'Checking completeness...',
  [ThinkingStep.REFLECT]: 'Reflecting on analysis...',
  [ThinkingStep.GENERATE_PDP]: 'Suggesting development goals...',
  [ThinkingStep.SAVE]: 'Saving results...',
};

function thinkingStepLabel(step?: string | null): string | null {
  if (!step) return null;
  return THINKING_STEP_LABELS[step] ?? null;
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

  const loadingMessages = useAppSelector(selectMessagesLoading);
  const sendingMessage = useAppSelector(selectMessagesSending);
  // Conversation context — server-driven action state
  const context = useAppSelector(
    (state) => selectContextByConversation(state, effectiveConversationId)
  );

  // Artefact ID comes from the server-driven context (reliable across all flows)
  const artefactId = context?.artefactId ?? artefactIdRef.current;

  // Per-component selector instances — stable across renders, memoize per conversationId
  const selectServerMessages = useMemo(() => makeSelectServerMessages(), []);
  const selectOptimisticMessages = useMemo(() => makeSelectOptimisticMessages(), []);

  const serverMessages = useAppSelector(
    (state) => selectServerMessages(state, effectiveConversationId)
  ) as Message[];

  const optimisticMessages = useAppSelector(
    (state) => selectOptimisticMessages(state, effectiveConversationId)
  );

  // Merge server messages + optimistic messages, sorted newest first
  const mergedMessages: RenderableMessage[] = useMemo(() => {
    const optimisticRendered = optimisticMessages.map(toRenderableMessage);
    const all = [...(serverMessages as RenderableMessage[]), ...optimisticRendered];
    // Sort newest first (matches inverted FlatList)
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all;
  }, [serverMessages, optimisticMessages]);

  const hasUnsentMessages = optimisticMessages.length > 0;

  // Count user words in the current segment (since the last assistant question, or all if none).
  // mergedMessages is sorted newest-first, so we walk forward until we hit an assistant message.
  const segmentWordCount = useMemo(() => {
    let count = 0;
    for (const m of mergedMessages) {
      // Stop at the first assistant message — that's the segment boundary
      if (m.role === MessageRole.ASSISTANT) break;
      if (m.role === MessageRole.USER && m.content) {
        count += m.content.split(/\s+/).filter(Boolean).length;
      }
    }
    return count;
  }, [mergedMessages]);

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
    if (!effectiveConversationId || isPendingConversation || pollIntervalMs === null) {
      return undefined;
    }

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

  // Optimistic flag — gives instant feedback while the HTTP call is in flight
  const [pendingAnalysis, setPendingAnalysis] = useState(false);

  // Track whether voice recorder is open — hides ActionBar to avoid overlap
  const [isRecording, setIsRecording] = useState(false);

  // Phase-aware flags derived from server context
  const canSendMessage = (context?.actions.sendMessage.allowed ?? true) && !pendingAnalysis;
  const canSendAudio = (context?.actions.sendAudio.allowed ?? true) && !pendingAnalysis;
  const canStartAnalysis = context?.actions.startAnalysis.allowed ?? false;
  const canResumeAnalysis = context?.actions.resumeAnalysis.allowed ?? false;
  const phase = context?.phase;

  // Clear the flag once the server confirms the phase change
  useEffect(() => {
    if (phase === 'analysing') setPendingAnalysis(false);
  }, [phase]);

  const handleStartAnalysis = useCallback(async () => {
    setPendingAnalysis(true);
    await dispatch(startAnalysis(effectiveConversationId));
  }, [effectiveConversationId, dispatch]);

  const handleResumeAnalysis = useCallback(
    async (messageId?: string, value?: Record<string, unknown>) => {
      const msgId = messageId ?? context?.activeQuestion?.messageId;
      if (!msgId) return;
      setPendingAnalysis(true);
      await dispatch(
        resumeAnalysis({
          conversationId: effectiveConversationId,
          messageId: msgId,
          value,
        })
      );
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

        dispatch(
          resumeAnalysisWithOptimistic({
            conversationId: effectiveConversationId,
            messageId,
            value,
            optimisticContent,
            localId: generateLocalId(),
            idempotencyKey: generateIdempotencyKey(),
          })
        );
      } else {
        // Fallback for free_text or unknown question types — no optimistic bubble
        handleResumeAnalysis(messageId, value);
      }
    },
    [mergedMessages, effectiveConversationId, handleResumeAnalysis, dispatch]
  );

  // Single derived bar state — status mode (busy) or action mode (clickable)
  const actionBarState = useMemo((): ActionBarState | null => {
    // No conversation yet — hide the bar entirely
    if (mergedMessages.length === 0 && !context) return null;

    // Local pipeline states take priority (sending / processing)
    if (hasUnsentMessages) {
      return { mode: 'status', reason: 'Sending your message...' };
    }
    if (hasProcessingMessages) {
      return { mode: 'status', reason: 'Processing your message...' };
    }

    // Optimistic or server-confirmed analysis in progress
    if (pendingAnalysis || phase === 'analysing') {
      const reason =
        thinkingStepLabel(context?.analysisRun?.thinkingReason) ?? 'Starting analysis...';
      return { mode: 'status', reason };
    }

    // Word count gate — composing phase uses initial threshold
    if (phase === 'composing' && segmentWordCount < INITIAL_WORD_THRESHOLD) {
      if (segmentWordCount > 0) {
        return { mode: 'progress', wordCount: segmentWordCount, threshold: INITIAL_WORD_THRESHOLD };
      }
      return null;
    }

    // Action buttons — only shown once word threshold is met
    if (canStartAnalysis) {
      return { mode: 'action', variant: 'start', onPress: handleStartAnalysis };
    }

    // Word count gate — free_text follow-ups use follow-up threshold
    if (
      canResumeAnalysis &&
      context?.activeQuestion?.questionType === 'free_text' &&
      segmentWordCount < FOLLOWUP_WORD_THRESHOLD
    ) {
      if (segmentWordCount > 0) {
        return {
          mode: 'progress',
          wordCount: segmentWordCount,
          threshold: FOLLOWUP_WORD_THRESHOLD,
        };
      }
      return null;
    }

    // Only show "Continue Analysis" for free_text — select questions resume via the inline card
    if (canResumeAnalysis && context?.activeQuestion?.questionType === 'free_text') {
      return { mode: 'action', variant: 'continue', onPress: () => handleResumeAnalysis() };
    }

    return null;
  }, [
    mergedMessages.length,
    context,
    hasUnsentMessages,
    hasProcessingMessages,
    pendingAnalysis,
    phase,
    segmentWordCount,
    canStartAnalysis,
    canResumeAnalysis,
    handleStartAnalysis,
    handleResumeAnalysis,
  ]);

  const activeQuestionMessageId = context?.activeQuestion?.messageId;

  const isLoading = loadingMessages && mergedMessages.length === 0 && isNew !== 'true';
  const showEmptyState = mergedMessages.length === 0 && !isLoading && !context;
  const composerBg = isDark ? colors.surface : colors.background;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <View style={phase === 'completed' ? styles.dimmed : styles.flex}>
          {showEmptyState ? (
            <ChatEmptyState />
          ) : (
            <MessageList
              messages={mergedMessages}
              currentUserId={user?.id ?? ''}
              isLoading={isLoading}
              activeQuestionMessageId={activeQuestionMessageId}
              onAnswerQuestion={handleAnswerQuestion}
              onRetry={handleRetry}
            />
          )}
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
            {actionBarState && !isRecording && <ActionBar state={actionBarState} />}

            <ChatComposer
              onSend={handleSend}
              onSendVoiceNote={handleSendVoiceNote}
              isSending={sendingMessage}
              canSendMessage={canSendMessage}
              canSendAudio={canSendAudio}
              phase={pendingAnalysis ? 'analysing' : phase}
              onRecordingChange={setIsRecording}
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
