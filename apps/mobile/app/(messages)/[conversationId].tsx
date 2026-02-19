import { api } from '@/api/client';
import { ChatComposer } from '@/components';
import { useAppDispatch, useAppSelector, useAuth } from '@/hooks';
import type { AudioRecordingResult } from '@/hooks/useAudioRecorder';
import { createArtefact, fetchMessages, pollMessages, sendMessage } from '@/store';
import { useTheme } from '@/theme';
import { logger } from '@/utils/logger';
import {
  MediaType,
  Message,
  MessageProcessingStatus,
  MessageRole,
  MessageType,
  PROCESSING_STATUS_LABELS,
} from '@acme/shared';
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { Bubble, GiftedChat, Message as GiftedMessage, IMessage } from 'react-native-gifted-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shallowEqual } from 'react-redux';

// Stable empty array — prevents a new reference on every render for unseen conversations
const EMPTY_IDS: string[] = [];

const TERMINAL_STATUSES = new Set<MessageProcessingStatus>([
  MessageProcessingStatus.COMPLETE,
  MessageProcessingStatus.FAILED,
]);

const POLL_INTERVAL_MS = __DEV__ ? 2000 : 5000;

const chatLogger = logger.createScope('ChatScreen');

export default function ChatScreen() {
  const { conversationId, isNew } = useLocalSearchParams<{
    conversationId: string;
    isNew?: string;
  }>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Track the real conversation ID (from backend) for new conversations
  const realConversationIdRef = useRef<string | null>(null);
  const isPendingConversation = isNew === 'true' && !realConversationIdRef.current;
  // Use real conversation ID if available, otherwise use URL param
  const effectiveConversationId = realConversationIdRef.current ?? conversationId ?? '';

  const loadingMessages = useAppSelector((state) => state.messages.loading);
  const sendingMessage = useAppSelector((state) => state.messages.sending);

  // Step 1: stable ID list — only changes when this conversation's message list changes
  const messageIds = useAppSelector(
    (state) => state.messages.idsByConversation[effectiveConversationId] ?? EMPTY_IDS
  );

  // Step 2: map IDs → entities — shallowEqual means re-render only when a message
  // object in THIS conversation changes, not when any other conversation is updated
  const messages = useAppSelector(
    (state) => messageIds.map((id) => state.messages.entities[id]).filter(Boolean) as Message[],
    shallowEqual
  );

  // Track keyboard visibility to adjust bottom padding
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Fetch messages for existing conversations (not newly created ones)
  useEffect(() => {
    if (conversationId && isNew !== 'true') {
      dispatch(fetchMessages({ conversationId }));
    }
  }, [conversationId, isNew, dispatch]);

  // Derive pending message IDs — stable boolean to control interval lifecycle
  const pendingMessageIds = useMemo(
    () => messages.filter((m) => !TERMINAL_STATUSES.has(m.processingStatus)).map((m) => m.id),
    [messages]
  );
  const hasPendingMessages = pendingMessageIds.length > 0;

  // Always-fresh ref so the interval closure never captures stale IDs
  const pendingIdsRef = useRef<string[]>(pendingMessageIds);
  pendingIdsRef.current = pendingMessageIds;

  // Polling: start when there are pending messages, pause when app is backgrounded
  useEffect(() => {
    if (!hasPendingMessages) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        if (pendingIdsRef.current.length > 0) {
          dispatch(pollMessages(pendingIdsRef.current));
        }
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
      if (nextState === 'active') startPolling();
      else stopPolling();
    });

    return () => {
      stopPolling();
      appStateSub.remove();
    };
  }, [hasPendingMessages, dispatch]);

  const toGiftedMessage = useCallback(
    (msg: Message): IMessage => {
      // For non-terminal audio messages, show a processing label instead of content
      const statusLabel =
        !TERMINAL_STATUSES.has(msg.processingStatus) && msg.messageType !== MessageType.TEXT
          ? PROCESSING_STATUS_LABELS[msg.processingStatus]
          : null;

      return {
        _id: msg.id,
        text: statusLabel ?? msg.content ?? '',
        createdAt: new Date(msg.createdAt),
        user: {
          _id: msg.role === MessageRole.USER ? (user?.id ?? 'user') : 'assistant',
          name: msg.role === MessageRole.USER ? (user?.name ?? 'You') : 'Assistant',
        },
      };
    },
    [user]
  );

  const giftedMessages = useMemo(() => {
    return messages.map(toGiftedMessage);
  }, [messages, toGiftedMessage]);

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
          const artefact = await dispatch(
            createArtefact({ artefactId: conversationId })
          ).unwrap();
          targetConversationId = artefact.conversation.id;
          realConversationIdRef.current = targetConversationId;
        }

        dispatch(sendMessage({ conversationId: targetConversationId ?? conversationId, mediaId }));
      } catch (error) {
        chatLogger.error('Failed to send voice note', { error });
      }
    },
    [conversationId, isNew, dispatch]
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!conversationId || !text.trim()) return;

      // For new conversations, create artefact first to get real conversation ID
      if (isPendingConversation) {
        try {
          // Create artefact using the local UUID as artefactId
          const artefact = await dispatch(createArtefact({ artefactId: conversationId })).unwrap();
          const realId = artefact.conversation.id;
          realConversationIdRef.current = realId;

          // Send message to the real conversation
          await dispatch(sendMessage({ conversationId: realId, content: text }));
        } catch (error) {
          chatLogger.error('Failed to create conversation', { error });
        }
      } else {
        // Normal flow - use effective conversation ID
        dispatch(sendMessage({ conversationId: effectiveConversationId, content: text }));
      }
    },
    [conversationId, effectiveConversationId, isPendingConversation, dispatch]
  );

  const renderBubble = useCallback(
    (props: any) => (
      <Bubble
        {...props}
        wrapperStyle={{
          left: {
            backgroundColor: colors.surface,
          },
          right: {
            backgroundColor: colors.primary,
          },
        }}
        textStyle={{
          left: {
            fontSize: 16,
            color: colors.text,
          },
          right: {
            fontSize: 16,
            color: '#fff',
          },
        }}
      />
    ),
    [colors]
  );

  const renderMessage = useCallback(
    (props: any) => (
      <GiftedMessage
        {...props}
        containerStyle={{
          left: { maxWidth: '80%' },
          right: { maxWidth: '80%' },
        }}
      />
    ),
    []
  );

  // Hide GiftedChat's input toolbar - we use our own ChatComposer
  const renderInputToolbar = useCallback(() => null, []);

  const renderLoading = useCallback(
    () => (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    ),
    [colors]
  );

  // Only show loading for existing conversations that are fetching
  if (loadingMessages && messages.length === 0 && isNew !== 'true') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        {renderLoading()}
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={styles.messagesContainer}>
        <GiftedChat
          messages={giftedMessages}
          onSend={() => {}}
          user={{
            _id: user?.id ?? 'user',
            name: user?.name ?? 'You',
          }}
          renderBubble={renderBubble}
          renderMessage={renderMessage}
          renderInputToolbar={renderInputToolbar}
          renderLoading={renderLoading}
          minInputToolbarHeight={0}
          isDayAnimationEnabled={false}
          listProps={{
            keyboardDismissMode: 'interactive',
            keyboardShouldPersistTaps: 'handled',
            contentContainerStyle: { paddingBottom: 20 },
          }}
        />
      </View>

      <ChatComposer
        onSend={handleSend}
        onSendVoiceNote={handleSendVoiceNote}
        isSending={sendingMessage}
        onOpenAttachments={() => {}}
        onOpenCamera={() => {}}
        onToggleStickers={() => {}}
        style={{ paddingBottom: keyboardVisible ? 0 : insets.bottom }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
