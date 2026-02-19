import { PROCESSING_STATUS_LABELS, type Message, MessageProcessingStatus, MessageType } from '@acme/shared';
import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../../theme';

const TERMINAL = new Set([MessageProcessingStatus.COMPLETE, MessageProcessingStatus.FAILED]);

interface Props {
  message: Message;
}

export const TextContent = memo(function TextContent({ message }: Props) {
  const { colors } = useTheme();

  const isProcessing = !TERMINAL.has(message.processingStatus);
  const statusLabel =
    isProcessing && message.messageType !== MessageType.TEXT
      ? PROCESSING_STATUS_LABELS[message.processingStatus]
      : null;

  const text = statusLabel ?? message.content ?? '';

  return (
    <Text style={[styles.text, { color: colors.text }, statusLabel ? styles.italic : null]}>
      {text}
    </Text>
  );
});

const styles = StyleSheet.create({
  text: {
    fontSize: 15,
    lineHeight: 20,
  },
  italic: {
    fontStyle: 'italic',
    opacity: 0.7,
  },
});
