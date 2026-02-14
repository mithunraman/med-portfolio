import { ChatComposer } from '@/components';
import { useAppDispatch, useAppSelector, useAuth } from '@/hooks';
import { fetchMessages, sendMessage } from '@/store';
import { useTheme } from '@/theme';
import { Message, MessageRole } from '@acme/shared';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Bubble, GiftedChat, IMessage } from 'react-native-gifted-chat';
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

  const { messages, loadingMessages, sendingMessage, conversationExists } = useAppSelector(
    (state) => ({
      messages: state.conversations.messages[conversationId ?? ''] ?? [],
      loadingMessages: state.conversations.loadingMessages,
      sendingMessage: state.conversations.sendingMessage,
      conversationExists: state.conversations.conversations.some(
        (c) => c.conversationId === conversationId
      ),
    })
  );

  // Only fetch messages if this is an existing conversation (not newly created)
  useEffect(() => {
    if (conversationId && isNew !== 'true' && conversationExists) {
      dispatch(fetchMessages({ conversationId }));
    }
  }, [conversationId, isNew, conversationExists, dispatch]);

  const toGiftedMessage = useCallback(
    (msg: Message): IMessage => ({
      _id: msg.id,
      text: msg.content,
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
    (text: string) => {
      if (!conversationId || !text.trim()) return;
      dispatch(sendMessage({ conversationId, content: text }));
    },
    [conversationId, dispatch]
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
            color: colors.text,
          },
          right: {
            color: '#fff',
          },
        }}
      />
    ),
    [colors]
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {renderLoading()}
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
          renderInputToolbar={renderInputToolbar}
          renderLoading={renderLoading}
          minInputToolbarHeight={0}
        />
      </View>

      <ChatComposer
        onSend={handleSend}
        isSending={sendingMessage}
        onOpenAttachments={() => console.log('Open attachments')}
        onOpenCamera={() => console.log('Open camera')}
        onToggleStickers={() => console.log('Toggle stickers')}
        onStartRecording={() => console.log('Start recording')}
        onStopRecording={() => console.log('Stop recording')}
        style={{ paddingBottom: insets.bottom }}
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
