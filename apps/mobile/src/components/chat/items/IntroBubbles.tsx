import { Feather } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { hexToRgba } from '../../../utils/color';
import { BUBBLE_COLORS, BUBBLE_SHADOW } from '../bubble/bubbleTokens';

type IntroBubble = {
  text: string;
  variant: 'default' | 'warning';
};

// Client-only onboarding tips rendered as the first assistant bubbles at the top
// of every conversation. Purely presentational - never persisted, sent to the
// backend, or included in message grouping / analysis / the edit-lock cut-off.
const INTRO_BUBBLES: IntroBubble[] = [
  {
    text: 'Tell me about a recent case - a tricky consultation, a procedure, something you learned. Take as many messages as you need, by voice or text.',
    variant: 'default',
  },
  {
    text: "No rush - once there's enough to work with, I can start analysing.",
    variant: 'default',
  },
  {
    text: "I'll then ask a few questions to help shape your reflection.",
    variant: 'default',
  },
  {
    text: 'Please keep it anonymous - no patient names or identifiable details.',
    variant: 'warning',
  },
];

export const IntroBubbles = memo(function IntroBubbles() {
  const { colors, isDark } = useTheme();
  const receivedColor = isDark ? BUBBLE_COLORS.received.dark : BUBBLE_COLORS.received.light;

  return (
    <View style={styles.container}>
      {INTRO_BUBBLES.map((bubble, index) => {
        const isWarning = bubble.variant === 'warning';

        return (
          <View key={index} style={styles.row}>
            <View
              style={[
                styles.bubble,
                isWarning
                  ? {
                      backgroundColor: hexToRgba(colors.error, 0.12),
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: hexToRgba(colors.error, 0.4),
                    }
                  : { backgroundColor: receivedColor },
              ]}
            >
              {isWarning ? (
                <View style={styles.warningRow}>
                  <Feather
                    name="shield"
                    size={16}
                    color={colors.error}
                    style={styles.warningIcon}
                  />
                  <Text
                    style={[styles.text, styles.warningText, { color: colors.text }]}
                    accessibilityLabel={`Important: ${bubble.text}`}
                  >
                    {bubble.text}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.text, { color: colors.text }]}>{bubble.text}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingBottom: 6,
    gap: 4,
  },
  row: {
    alignItems: 'flex-start',
    marginLeft: 4,
  },
  bubble: {
    maxWidth: '90%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    ...BUBBLE_SHADOW,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  warningIcon: {
    marginTop: 1,
  },
  warningText: {
    flexShrink: 1,
    fontWeight: '500',
  },
});
