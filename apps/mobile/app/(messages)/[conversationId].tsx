import { api } from '@/api/client';
import { ChatComposer, MessageList } from '@/components';
import { useAppDispatch, useAppSelector, useAuth } from '@/hooks';
import type { AudioRecordingResult } from '@/hooks/useAudioRecorder';
import { createArtefact, fetchMessages, pollConversation, sendMessage } from '@/store';
import { useTheme } from '@/theme';
import { logger } from '@/utils/logger';
import { MediaType, Message } from '@acme/shared';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shallowEqual } from 'react-redux';

// Stable empty array — prevents a new reference on every render for unseen conversations
const EMPTY_IDS: string[] = [];

const POLL_INTERVAL_MS = __DEV__ ? 2000 : 5000;

const chatLogger = logger.createScope('ChatScreen');

export default function ChatScreen() {
  const { conversationId, isNew } = useLocalSearchParams<{
    conversationId: string;
    isNew?: string;
  }>();
  const dispatch = useAppDispatch();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  // Track the real conversation ID (from backend) for new conversations
  const realConversationIdRef = useRef<string | null>(null);
  const isPendingConversation = isNew === 'true' && !realConversationIdRef.current;
  // Use real conversation ID if available, otherwise use URL param
  const effectiveConversationId = realConversationIdRef.current ?? conversationId ?? '';

  const loadingMessages = useAppSelector((state) => state.messages.loading);
  const sendingMessage = useAppSelector((state) => state.messages.sending);

  // Conversation context — server-driven action state
  const context = useAppSelector(
    (state) => state.messages.contextByConversation[effectiveConversationId],
  );

  // Step 1: stable ID list — only changes when this conversation's message list changes
  const messageIds = useAppSelector(
    (state) => state.messages.idsByConversation[effectiveConversationId] ?? EMPTY_IDS,
  );

  // Step 2: map IDs → entities — shallowEqual means re-render only when a message
  // object in THIS conversation changes, not when any other conversation is updated
  const messages = useAppSelector(
    (state) => messageIds.map((id) => state.messages.entities[id]).filter(Boolean) as Message[],
    shallowEqual,
  );

  // Fetch messages for existing conversations (not newly created ones)
  useEffect(() => {
    if (conversationId && isNew !== 'true') {
      dispatch(fetchMessages({ conversationId }));
    }
  }, [conversationId, isNew, dispatch]);

  // Unified polling: re-fetch messages + context on interval
  // Polls while the screen is active and conversation exists. Pauses when backgrounded.
  useEffect(() => {
    if (!effectiveConversationId || isPendingConversation) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        dispatch(pollConversation(effectiveConversationId));
      }, POLL_INTERVAL_MS);
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
        // On foreground, immediately poll then resume interval
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
  }, [effectiveConversationId, isPendingConversation, dispatch]);

  const handleSendVoiceNote = useCallback(
    async (recording: AudioRecordingResult) => {
      if (!conversationId) return;

      try {
        const { mediaId, uploadUrl } = await api.media.initiateUpload({
          mediaType: MediaType.AUDIO,
          mimeType: recording.mime,
        });

        // Upload the audio file directly to S3 via the presigned URL
        const fileResponse = await fetch(recording.uri);
        const blob = await fileResponse.blob();
        await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': recording.mime },
          body: blob,
        });

        // For new conversations, create artefact first — same as handleSend
        let targetConversationId = realConversationIdRef.current;
        if (!targetConversationId && isNew === 'true') {
          const artefact = await dispatch(createArtefact({ artefactId: conversationId })).unwrap();
          targetConversationId = artefact.conversation.id;
          realConversationIdRef.current = targetConversationId;
        }

        dispatch(sendMessage({ conversationId: targetConversationId ?? conversationId, mediaId }));
      } catch (error) {
        chatLogger.error('Failed to send voice note', { error });
      }
    },
    [conversationId, isNew, dispatch],
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!conversationId || !text.trim()) return;

      // For new conversations, create artefact first to get real conversation ID
      if (isPendingConversation) {
        try {
          const artefact = await dispatch(createArtefact({ artefactId: conversationId })).unwrap();
          const realId = artefact.conversation.id;
          realConversationIdRef.current = realId;
          await dispatch(sendMessage({ conversationId: realId, content: text }));
        } catch (error) {
          chatLogger.error('Failed to create conversation', { error });
        }
      } else {
        dispatch(sendMessage({ conversationId: effectiveConversationId, content: text }));
      }
    },
    [conversationId, effectiveConversationId, isPendingConversation, dispatch],
  );

  const isLoading = loadingMessages && messages.length === 0 && isNew !== 'true';
  const composerBg = isDark ? colors.surface : colors.background;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        <MessageList messages={messages} currentUserId={user?.id ?? ''} isLoading={isLoading} />

        <ChatComposer
          onSend={handleSend}
          onSendVoiceNote={handleSendVoiceNote}
          isSending={sendingMessage}
          onOpenAttachments={() => {}}
          onOpenCamera={() => {}}
          onToggleStickers={() => {}}
        />
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
});
