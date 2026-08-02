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
            {/* The question is the primary element (H1). Numbering only appears when
                there is more than one prompt - a lone "1." adds noise. */}
            <Text style={[styles.promptText, { color: colors.text }]} accessibilityRole="header">
              {question.prompts.length > 1 && (
                <Text style={[styles.promptNumber, { color: colors.primary }]}>{index + 1}. </Text>
              )}
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
    marginTop: 2,
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
    // flexShrink lets the text wrap at the bubble edge instead of overflowing to
    // its intrinsic single-line width (the only width cap is a % maxWidth on a
    // distant ancestor, which doesn't propagate down to this nested Text).
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
    marginHorizontal: 4,
  },
});
