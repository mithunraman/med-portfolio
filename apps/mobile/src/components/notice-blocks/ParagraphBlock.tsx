import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme';

interface Props {
  text: string;
}

export function ParagraphBlock({ text }: Props) {
  const { colors } = useTheme();
  return <Text style={[styles.paragraph, { color: colors.text }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
  },
});
