import { MessageProcessingStatus, MessageRole, MessageType, type Message } from '@acme/shared';
import type { DeliveryStatus } from '../../store/slices/messages/slice';
import { memo, useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AudioContent } from './bubble/AudioContent';
import { BubbleShell } from './bubble/BubbleShell';
import { DeletedContent } from './bubble/DeletedContent';
import { QuestionContent } from './bubble/QuestionContent';
import { TextContent } from './bubble/TextContent';

const noop = () => {};

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
  isActiveQuestion?: boolean;
  deliveryStatus?: DeliveryStatus;
  onAnswerQuestion?: (messageId: string, value: Record<string, unknown>) => void;
  onLongPress?: (message: Message, pageY: number) => void;
  onRetry?: (localId: string) => void;
}

export const MessageRow = memo(function MessageRow({
  message,
  isLastInGroup,
  isFirstInGroup,
  isActiveQuestion = false,
  deliveryStatus,
  onAnswerQuestion,
  onLongPress,
  onRetry,
}: Props) {
  const isUser = message.role === MessageRole.USER;
  const rowRef = useRef<View>(null);

  const handleLongPress = useCallback(() => {
    if (!onLongPress) return;
    rowRef.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
      onLongPress(message, pageY);
    });
  }, [message, onLongPress]);

  const handlePress = useCallback(() => {
    if (deliveryStatus === 'failed' && onRetry) {
      onRetry(message.id); // message.id is the localId for optimistic messages
    }
  }, [deliveryStatus, onRetry, message.id]);

  const content = isDeleted(message) ? (
    <DeletedContent />
  ) : message.question ? (
    <QuestionContent
      message={message}
      isActiveQuestion={isActiveQuestion}
      onAnswer={onAnswerQuestion ?? noop}
    />
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
        onPress={deliveryStatus === 'failed' ? handlePress : undefined}
        onLongPress={deliveryStatus ? undefined : handleLongPress}
        delayLongPress={350}
        style={[styles.pressable, isUser ? styles.pressableRight : styles.pressableLeft]}
      >
        <BubbleShell
          message={message}
          isLastInGroup={isLastInGroup}
          isFirstInGroup={isFirstInGroup}
          deliveryStatus={deliveryStatus}
        >
          {content}
        </BubbleShell>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 0,
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
    maxWidth: '90%',
  },
  pressableLeft: {
    marginLeft: 4,
  },
  pressableRight: {
    marginRight: 4,
  },
});
