import { Feather } from '@expo/vector-icons';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

const ACCENT_COLOR = '#00a884';

const THINKING_WORDS = ['Thinking', 'Analysing', 'Processing', 'Working', 'Evaluating'];

function useRotatingText(words: string[], intervalMs = 2500): string {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    // Reset to 0 when entering status mode
    setIndex(0);
    indexRef.current = 0;

    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % words.length;
      setIndex(indexRef.current);
    }, intervalMs);
    return () => clearInterval(id);
  }, [words, intervalMs]);

  return words[index];
}

// --- Public types ---

export type ActionBarState =
  | { mode: 'status'; reason: string }
  | { mode: 'action'; variant: 'start' | 'continue'; onPress: () => void };

interface ActionBarProps {
  state: ActionBarState;
}

// --- Component ---

export const ActionBar = memo(function ActionBar({ state }: ActionBarProps) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? colors.surface : colors.background,
          borderTopColor: colors.border,
        },
      ]}
    >
      {state.mode === 'status' ? (
        <StatusBar reason={state.reason} colors={colors} />
      ) : (
        <ActionButton variant={state.variant} onPress={state.onPress} />
      )}
    </View>
  );
});

// --- Status mode ---

function StatusBar({ reason, colors }: { reason: string; colors: { textSecondary: string } }) {
  const thinkingWord = useRotatingText(THINKING_WORDS);

  return (
    <View style={styles.statusRow}>
      <Text style={styles.thinkingLabel}>{thinkingWord}...</Text>
      <Text style={[styles.reasonLabel, { color: colors.textSecondary }]} numberOfLines={1}>
        {reason}
      </Text>
    </View>
  );
}

// --- Action mode ---

function ActionButton({
  variant,
  onPress,
}: {
  variant: 'start' | 'continue';
  onPress: () => void;
}) {
  const label = variant === 'start' ? 'Start Analysis' : 'Continue Analysis';
  const icon = variant === 'start' ? 'play-circle' : 'arrow-right-circle';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: ACCENT_COLOR, opacity: pressed ? 0.85 : 1 },
      ]}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Feather name={icon} size={18} color="#ffffff" />
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

// Fixed inner height so both modes occupy the same space — prevents layout shift
const INNER_HEIGHT = 48;

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Status mode
  statusRow: {
    height: INNER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  thinkingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: ACCENT_COLOR,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '400',
    flexShrink: 1,
  },
  // Action mode
  button: {
    height: INNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
