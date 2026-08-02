import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

// Generic, interchangeable "busy" gerunds - never tied to the actual pipeline step
// and framed on the entry/text (not clinical judgment on the patient). See MOB-044.
const THINKING_WORDS = [
  'Thinking',
  'Analysing',
  'Processing',
  'Working',
  'Evaluating',
  'Reviewing',
  'Reading',
  'Considering',
  'Organising',
  'Structuring',
  'Connecting',
  'Summarising',
  'Refining',
  'Preparing',
  'Understanding',
];

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
  // Server-supplied display copy - render as given, never map or branch on it.
  // Optional and purely additive: the rotating word above it always renders, so
  // callers with no server-reported label (local send/processing) simply omit it.
  | { mode: 'status'; thinkingLabel?: string | null }
  | { mode: 'action'; variant: 'start' | 'continue'; onPress: () => void }
  | { mode: 'progress'; wordCount: number; threshold: number };

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
        <StatusBar thinkingLabel={state.thinkingLabel} colors={colors} />
      ) : state.mode === 'progress' ? (
        <ProgressBar wordCount={state.wordCount} threshold={state.threshold} colors={colors} />
      ) : (
        <ActionButton onPress={state.onPress} colors={colors} />
      )}
    </View>
  );
});

// --- Status mode ---

function StatusBar({
  thinkingLabel,
  colors,
}: {
  thinkingLabel?: string | null;
  colors: { accent: string; textSecondary: string };
}) {
  // The rotating word is the primary signal and always shows; the server's
  // label is optional detail beneath it. Null until the first node of a run
  // reports in, so the second line simply isn't rendered until then.
  const thinkingWord = useRotatingText(THINKING_WORDS);

  return (
    <View style={styles.statusRow}>
      <Text style={[styles.rotatingWord, { color: colors.accent }]}>{thinkingWord}...</Text>
      {thinkingLabel ? (
        <Text style={[styles.stageLabel, { color: colors.textSecondary }]}>
          [ {thinkingLabel} ]
        </Text>
      ) : null}
    </View>
  );
}

// --- Progress mode ---

function ProgressBar({
  wordCount,
  threshold,
  colors,
}: {
  wordCount: number;
  threshold: number;
  colors: { textSecondary: string; primary: string; border: string };
}) {
  const ratio = Math.min(wordCount / threshold, 1);

  return (
    <View style={styles.progressRow}>
      <View style={styles.progressBarTrack}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${ratio * 100}%`, backgroundColor: colors.primary },
          ]}
        />
      </View>
      <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
        {wordCount} / {threshold} words - keep going
      </Text>
    </View>
  );
}

// --- Action mode ---

function ActionButton({
  onPress,
  colors,
}: {
  onPress: () => void;
  colors: { accent: string };
}) {
  // Single, model-agnostic label for both the first ("start") and follow-up
  // ("continue") hand-offs to the AI - see MOB-037. "Continue" stays truthful
  // whether the AI then asks a question or finishes, so it survives whichever
  // way the finished-vs-still-adding model (MOB-038) is resolved.
  const label = 'Continue';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
      ]}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Ionicons name="sparkles" size={18} color="#ffffff" />
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

// Fixed inner height so both modes occupy the same space - prevents layout shift
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
  // The generic rotating gerund (see THINKING_WORDS), not the server's label
  rotatingWord: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Server-supplied progress copy, rendered in brackets beneath
  stageLabel: {
    fontSize: 12,
    fontWeight: '400',
  },
  // Progress mode
  progressRow: {
    height: INNER_HEIGHT,
    justifyContent: 'center',
    gap: 8,
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
    overflow: 'hidden' as const,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
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
