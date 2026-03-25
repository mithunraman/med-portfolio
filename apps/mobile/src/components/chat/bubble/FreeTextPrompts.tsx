import type { FreeTextQuestion } from '@acme/shared';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { HintCard } from './HintCard';

interface Props {
  question: FreeTextQuestion;
  isActive: boolean;
}

/**
 * Renders follow-up question prompts inside an assistant message bubble.
 *
 * Layout per question:
 *   1. Question text here...              ← inline bold number + regular text
 *   e.g., "first example..."             ← 13px italic muted (always visible)
 *   ▸ More examples                      ← 13px muted (tap to expand)
 *   ──────────────────── separator        ← hairline between questions
 */
export const FreeTextPrompts = memo(function FreeTextPrompts({ question, isActive }: Props) {
  const { colors } = useTheme();
  const lastIndex = question.prompts.length - 1;

  return (
    <View style={[styles.container, !isActive && styles.dimmed]}>
      {question.prompts.map((prompt, index) => (
        <View key={prompt.key}>
          <View style={styles.promptItem}>
            {/* Question number + text — single text flow, no column gap */}
            <Text style={[styles.promptText, { color: colors.text }]}>
              <Text style={[styles.promptNumber, { color: colors.primary }]}>
                {index + 1}.{' '}
              </Text>
              {prompt.text}
            </Text>

            {/* Hints: first example inline, rest expandable */}
            <HintCard hints={prompt.hints} />
          </View>

          {/* Separator between questions (not after the last one) */}
          {index < lastIndex && (
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
          )}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
  },
  dimmed: {
    opacity: 0.5,
  },
  promptItem: {
    paddingVertical: 4,
  },
  promptNumber: {
    fontWeight: '600',
  },
  promptText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
    marginHorizontal: 4,
  },
});
