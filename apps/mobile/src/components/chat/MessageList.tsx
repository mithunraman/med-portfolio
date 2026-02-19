import type { Message } from '@acme/shared';
import { memo, useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '../../theme';
import { MessageContextMenu } from './MessageContextMenu';
import { MessageRow } from './MessageRow';
import { DateSeparator } from './items/DateSeparator';
import { NoticeItem } from './items/NoticeItem';
import { TypingIndicator } from './items/TypingIndicator';
import { ScrollToBottomFAB } from './ScrollToBottomFAB';
import { useMessageGroups } from './hooks/useMessageGroups';
import type { ContextMenuAction, FlatListItem } from './types';

const SCROLL_TO_BOTTOM_THRESHOLD = 150;

export interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  wallpaperSource?: ImageSourcePropType;
  noticeText?: string;
  isTyping?: boolean;
  unreadCount?: number;
  isLoading?: boolean;
  onReply?: (message: Message) => void;
  onCopy?: (message: Message) => void;
  onStar?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onReact?: (message: Message, emoji: string) => void;
}

function keyExtractor(item: FlatListItem): string {
  switch (item.type) {
    case 'message':        return item.data.id;
    case 'dateSeparator':  return `sep-${item.date}`;
    case 'typingIndicator':return 'typing';
    case 'notice':         return 'notice';
  }
}

export const MessageList = memo(function MessageList({
  messages,
  currentUserId,
  wallpaperSource,
  noticeText,
  isTyping,
  unreadCount = 0,
  isLoading = false,
  onReply,
  onCopy,
  onStar,
  onDelete,
  onForward,
  onReact,
}: MessageListProps) {
  const { colors } = useTheme();
  const flatListRef = useRef<FlatList<FlatListItem>>(null);
  const [showFAB, setShowFAB] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [menuAnchorY, setMenuAnchorY] = useState(0);

  const items = useMessageGroups(messages, { isTyping, noticeText });

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.y;
      setShowFAB(offset > SCROLL_TO_BOTTOM_THRESHOLD);
    },
    []
  );

  const handleScrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleLongPress = useCallback((message: Message, pageY: number) => {
    setSelectedMessage(message);
    setMenuAnchorY(pageY);
  }, []);

  const handleMenuAction = useCallback(
    (action: ContextMenuAction, message: Message) => {
      switch (action) {
        case 'reply':   onReply?.(message);   break;
        case 'copy':    onCopy?.(message);    break;
        case 'star':    onStar?.(message);    break;
        case 'delete':  onDelete?.(message);  break;
        case 'forward': onForward?.(message); break;
        case 'react':   onReact?.(message, '👍'); break;
      }
    },
    [onReply, onCopy, onStar, onDelete, onForward, onReact]
  );

  const handleMenuDismiss = useCallback(() => {
    setSelectedMessage(null);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FlatListItem }) => {
      switch (item.type) {
        case 'message':
          return (
            <MessageRow
              message={item.data}
              isLastInGroup={item.isLastInGroup}
              isFirstInGroup={item.isFirstInGroup}
              onLongPress={handleLongPress}
            />
          );
        case 'dateSeparator':
          return <DateSeparator date={item.date} />;
        case 'typingIndicator':
          return <TypingIndicator />;
        case 'notice':
          return <NoticeItem text={item.text} />;
      }
    },
    [handleLongPress]
  );

  const content = isLoading ? (
    <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  ) : (
    <View style={styles.flex}>
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        inverted
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        removeClippedSubviews
      />

      <ScrollToBottomFAB
        visible={showFAB}
        unreadCount={unreadCount}
        onPress={handleScrollToBottom}
      />

      <MessageContextMenu
        message={selectedMessage}
        onAction={handleMenuAction}
        onDismiss={handleMenuDismiss}
      />
    </View>
  );

  if (wallpaperSource) {
    return (
      <ImageBackground source={wallpaperSource} style={styles.flex} resizeMode="repeat">
        {content}
      </ImageBackground>
    );
  }

  return <View style={[styles.flex, { backgroundColor: colors.background }]}>{content}</View>;
});

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
