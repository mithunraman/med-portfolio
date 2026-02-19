import { ChatComposer } from '@/components';
import { useAppDispatch, useAppSelector, useAuth } from '@/hooks';
import { createArtefact, fetchMessages, sendMessage } from '@/store';
import { useTheme } from '@/theme';
import { logger } from '@/utils/logger';
import { Message, MessageRole } from '@acme/shared';

const chatLogger = logger.createScope('ChatScreen');
import { useHeaderHeight } from '@react-navigation/elements';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { Bubble, GiftedChat, Message as GiftedMessage, IMessage } from 'react-native-gifted-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

  const messagesMap = useAppSelector((state) => state.conversations.messages);
  const loadingMessages = useAppSelector((state) => state.conversations.loadingMessages);
  const sendingMessage = useAppSelector((state) => state.conversations.sendingMessage);

  // Track keyboard visibility to adjust bottom padding
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const messages = useMemo(
    () => messagesMap[effectiveConversationId] ?? [],
    [messagesMap, effectiveConversationId]
  );

  // Fetch messages for existing conversations (not newly created ones)
  useEffect(() => {
    if (conversationId && isNew !== 'true') {
      dispatch(fetchMessages({ conversationId }));
    }
  }, [conversationId, isNew, dispatch]);

  const toGiftedMessage = useCallback(
    (msg: Message): IMessage => ({
      _id: msg.id,
      text: msg.content ?? '',
      createdAt: new Date(msg.createdAt),
      user: {
        _id: msg.role === MessageRole.USER ? (user?.id ?? 'user') : 'assistant',
        name: msg.role === MessageRole.USER ? (user?.name ?? 'You') : 'Assistant',
      },
    }),
    [user]
  );

  const giftedMessages = useMemo(() => {
    return messages.map(toGiftedMessage);
  }, [messages, toGiftedMessage]);

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
        isSending={sendingMessage}
        onOpenAttachments={() => {}}
        onOpenCamera={() => {}}
        onToggleStickers={() => {}}
        onStartRecording={() => {}}
        onStopRecording={() => {}}
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
