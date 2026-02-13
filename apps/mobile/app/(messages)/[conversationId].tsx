import { useAppDispatch, useAppSelector, useAuth } from '@/hooks';
import { fetchMessages, sendMessage } from '@/store';
import { useTheme } from '@/theme';
import { Message, MessageRole } from '@acme/shared';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Bubble, GiftedChat, IMessage, InputToolbar, Send } from 'react-native-gifted-chat';
export default function ChatScreen() {
  const { conversationId, isNew } = useLocalSearchParams<{
    conversationId: string;
    isNew?: string;
  }>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const { user } = useAuth();

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
    (newMessages: IMessage[] = []) => {
      if (!conversationId || newMessages.length === 0) return;

      const messageText = newMessages[0].text;
      dispatch(sendMessage({ conversationId, content: messageText }));
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

  const renderInputToolbar = useCallback(
    (props: any) => (
      <InputToolbar
        {...props}
        containerStyle={[
          styles.inputToolbar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
        primaryStyle={styles.inputPrimary}
      />
    ),
    [colors]
  );

  const renderSend = useCallback(
    (props: any) => (
      <Send {...props} containerStyle={styles.sendContainer}>
        <View style={[styles.sendButton, { backgroundColor: colors.primary }]}>
          {sendingMessage ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="send" size={18} color="#fff" />
          )}
        </View>
      </Send>
    ),
    [colors, sendingMessage]
  );

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
      <GiftedChat
        messages={giftedMessages}
        onSend={handleSend}
        user={{
          _id: user?.id ?? 'user',
          name: user?.name ?? 'You',
        }}
        renderBubble={renderBubble}
        renderInputToolbar={renderInputToolbar}
        renderSend={renderSend}
        renderLoading={renderLoading}
        textInputProps={{
          style: [styles.textInput, { color: colors.text }],
          placeholder: 'Type a message...',
          placeholderTextColor: colors.textSecondary,
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputToolbar: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  inputPrimary: {
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 16,
    lineHeight: 20,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    marginBottom: 4,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
