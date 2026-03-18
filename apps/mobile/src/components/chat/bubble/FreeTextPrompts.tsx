import type { FreeTextQuestion } from '@acme/shared';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';

interface Props {
  question: FreeTextQuestion;
  isActive: boolean;
}

export const FreeTextPrompts = memo(function FreeTextPrompts({ question, isActive }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, !isActive && styles.dimmed]}>
      {question.missingSections && question.missingSections.length > 0 && (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Missing sections: {question.missingSections.join(', ')}
        </Text>
      )}
      <View style={styles.promptList}>
        {question.prompts.map((prompt, index) => (
          <View key={prompt.key} style={styles.promptRow}>
            <Text style={[styles.promptNumber, { color: colors.primary }]}>{index + 1}.</Text>
            <Text style={[styles.promptText, { color: colors.text }]}>{prompt.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 6,
  },
  dimmed: {
    opacity: 0.5,
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  promptList: {
    gap: 6,
  },
  promptRow: {
    flexDirection: 'row',
    gap: 6,
  },
  promptNumber: {
    fontSize: 15,
    fontWeight: '600',
    minWidth: 20,
  },
  promptText: {
    fontSize: 15,
    lineHeight: 20,
    flex: 1,
  },
});
