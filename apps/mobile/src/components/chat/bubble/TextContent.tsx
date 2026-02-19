import { type Message } from '@acme/shared';
import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../../theme';

interface Props {
  message: Message;
}

export const TextContent = memo(function TextContent({ message }: Props) {
  const { colors } = useTheme();

  return (
    <Text style={[styles.text, { color: colors.text }]}>{message.content ?? ''}</Text>
  );
});

const styles = StyleSheet.create({
  text: {
    fontSize: 16,
    lineHeight: 20,
  },
});
