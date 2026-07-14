import type { PromptHints } from '@acme/shared';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { BUBBLE_MUTED_TEXT } from './bubbleTokens';

interface Props {
  hints: PromptHints;
}

/**
 * Hint display: a labelled "Example answer" always visible, with any further
 * examples behind a "See more examples" accordion (progressive disclosure).
 *
 * Colour uses the fixed bubble-muted token (not theme `textSecondary`) so the
 * small hint text stays WCAG-AA on the fixed bubble background across all themes
 * (MOB-049). The toggle is chevron-led so it reads as an in-place expander, not a
 * page-leaving link, and the visible example is explicitly labelled (MOB-051).
 */
export const HintCard = memo(function HintCard({ hints }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { isDark } = useTheme();
  const muted = isDark ? BUBBLE_MUTED_TEXT.dark : BUBBLE_MUTED_TEXT.light;

  const [firstExample, ...restExamples] = hints.examples;
  const hasMore = restExamples.length > 0;

  if (!firstExample) return null;

  return (
    <View style={styles.container}>
      {/* Example answer — always visible */}
      <View style={styles.exampleBlock}>
        <Text style={[styles.exampleLabel, { color: muted }]}>Example answer</Text>
        <Text style={[styles.exampleText, { color: muted }]}>{'•'} {firstExample}</Text>
      </View>

      {/* Accordion — only when additional examples exist */}
      {hasMore && (
        <>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? 'Hide examples' : 'See more examples'}
          >
            <Text style={[styles.toggleText, { color: muted }]}>
              {expanded ? 'Hide examples' : 'See more examples'}
            </Text>
          </Pressable>

          {expanded && (
            <View style={styles.expandedContent}>
              {restExamples.map((example, i) => (
                <Text key={i} style={[styles.exampleText, { color: muted }]}>
                  {'•'} {example}
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
    marginTop: 12,
    gap: 4,
  },
  exampleBlock: {
    gap: 4,
  },
  exampleLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  exampleText: {
    fontSize: 13,
    lineHeight: 18,
  },
  toggle: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingVertical: 6,
    minHeight: 32,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  expandedContent: {
    gap: 6,
    marginBottom: 2,
  },
});
