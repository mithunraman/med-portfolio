import { MessageList } from '@/components';
import { useAppDispatch, useAppSelector, useAuth } from '@/hooks';
import { fetchMessages } from '@/store';
import { useTheme } from '@/theme';
import type { Message } from '@acme/shared';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { shallowEqual } from 'react-redux';

const EMPTY_IDS: string[] = [];

export default function ConversationViewScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const { user } = useAuth();

  const loadingMessages = useAppSelector((state) => state.messages.loading);

  const messageIds = useAppSelector(
    (state) => state.messages.idsByConversation[conversationId ?? ''] ?? EMPTY_IDS
  );

  const messages = useAppSelector(
    (state) => messageIds.map((id) => state.messages.entities[id]).filter(Boolean) as Message[],
    shallowEqual
  );

  useEffect(() => {
    if (conversationId) {
      dispatch(fetchMessages({ conversationId }));
    }
  }, [conversationId, dispatch]);

  const isLoading = loadingMessages && messages.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MessageList messages={messages} currentUserId={user?.id ?? ''} isLoading={isLoading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
