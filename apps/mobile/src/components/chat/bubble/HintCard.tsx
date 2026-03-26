import type { PromptHints } from '@acme/shared';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';

interface Props {
  hints: PromptHints;
}

/**
 * Hybrid hint display: first example always visible (inline, muted),
 * remaining examples behind a "More examples" toggle.
 *
 * Pattern: Wysa-style inline hint with progressive disclosure for overflow.
 * - First example: always visible, sets expectation for answer depth
 * - "More examples" toggle: only shown when 2+ examples exist
 */
export const HintCard = memo(function HintCard({ hints }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { colors } = useTheme();

  const [firstExample, ...restExamples] = hints.examples;
  const hasMore = restExamples.length > 0;

  return (
    <View style={styles.container}>
      {/* First example — always visible */}
      {firstExample && (
        <Text style={[styles.inlineHint, { color: colors.textSecondary }]}>
          e.g., {'\u201C'}{firstExample}{'\u201D'}
        </Text>
      )}

      {/* "More examples" toggle — only when additional examples exist */}
      {hasMore && (
        <>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'Hide examples' : 'Show more examples'}
          >
            <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
              {expanded ? '\u25BE' : '\u25B8'} More examples
            </Text>
          </Pressable>

          {expanded && (
            <View style={styles.expandedContent}>
              {restExamples.map((example, i) => (
                <Text key={i} style={[styles.expandedExample, { color: colors.textSecondary }]}>
                  {'\u201C'}{example}{'\u201D'}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    gap: 2,
  },
  inlineHint: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  toggle: {
    paddingVertical: 4,
    minHeight: 32,
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '500',
  },
  expandedContent: {
    gap: 4,
    marginBottom: 2,
  },
  expandedExample: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
});
