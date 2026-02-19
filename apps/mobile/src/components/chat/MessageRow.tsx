import {
  MessageProcessingStatus,
  MessageRole,
  MessageType,
  type Message,
} from '@acme/shared';
import { memo, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AudioContent } from './bubble/AudioContent';
import { BubbleShell } from './bubble/BubbleShell';
import { DeletedContent } from './bubble/DeletedContent';
import { TextContent } from './bubble/TextContent';

function isDeleted(message: Message): boolean {
  return (
    message.content === null &&
    message.messageType === MessageType.TEXT &&
    message.processingStatus === MessageProcessingStatus.FAILED
  );
}

interface Props {
  message: Message;
  isLastInGroup: boolean;
  isFirstInGroup: boolean;
  onLongPress?: (message: Message, pageY: number) => void;
}

export const MessageRow = memo(function MessageRow({
  message,
  isLastInGroup,
  isFirstInGroup,
  onLongPress,
}: Props) {
  const isUser = message.role === MessageRole.USER;
  const rowRef = useRef<View>(null);

  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    rowRef.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
      onLongPress(message, pageY);
    });
  }, [message, onLongPress]);

  const content = isDeleted(message) ? (
    <DeletedContent />
  ) : message.messageType === MessageType.AUDIO ? (
    <AudioContent message={message} />
  ) : (
    <TextContent message={message} />
  );

  return (
    <View
      ref={rowRef}
      style={[
        styles.row,
        isUser ? styles.rowRight : styles.rowLeft,
        isFirstInGroup ? styles.firstInGroup : styles.subsequentInGroup,
      ]}
    >
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={350}
        style={[styles.pressable, isUser ? styles.pressableRight : styles.pressableLeft]}
      >
        <BubbleShell
          message={message}
          isLastInGroup={isLastInGroup}
          isFirstInGroup={isFirstInGroup}
        >
          {content}
        </BubbleShell>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 8,
  },
  rowLeft: {
    alignItems: 'flex-start',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  firstInGroup: {
    marginTop: 6,
  },
  subsequentInGroup: {
    marginTop: 2,
  },
  pressable: {
    maxWidth: '80%',
  },
  pressableLeft: {
    marginLeft: 4,
  },
  pressableRight: {
    marginRight: 4,
  },
});
