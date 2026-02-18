import { Feather, Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useStopwatch } from '../hooks/useStopwatch';
import { useTheme } from '../theme';
import { formatTime } from '../utils/formatTime';
import { CircularButton } from './CircularButton';
import { IconButton } from './IconButton';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  pauseButton: '#ef4444', // Red
  sendButton: '#22c55e', // Green
  iconWhite: '#ffffff',
  dottedLine: 'rgba(255, 255, 255, 0.3)',
} as const;

const SPACING = {
  containerPadding: 16,
  buttonSize: 48,
  iconSize: 22,
  dotSize: 4,
  dotGap: 8,
  bottomPadding: 24,
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface VoiceNoteRecorderBarProps {
  /** Whether the recorder bar is visible */
  visible: boolean;
  /** Initial elapsed time in milliseconds (for resuming) */
  initialElapsedMs?: number;
  /** Bottom safe area inset */
  safeAreaBottomInset?: number;
  /** Prefix for testIDs */
  testIDPrefix?: string;
  /** Called when user discards the recording */
  onDiscard: () => void;
  /** Called when user toggles pause state */
  onTogglePause?: (isPaused: boolean) => void;
  /** Called when user sends the recording */
  onSend: (result: { durationMs: number }) => void;
  /** Optional container style */
  style?: StyleProp<ViewStyle>;
}

// ============================================================================
// DOTTED LINE COMPONENT
// ============================================================================

const DottedLine = memo(function DottedLine({ dotCount = 30 }: { dotCount?: number }) {
  const dots = useMemo(() => Array.from({ length: dotCount }, (_, i) => i), [dotCount]);

  return (
    <View style={styles.dottedLineContainer}>
      {dots.map((i) => (
        <View key={i} style={styles.dot} />
      ))}
    </View>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const VoiceNoteRecorderBar = memo(function VoiceNoteRecorderBar({
  visible,
  initialElapsedMs = 0,
  safeAreaBottomInset = 0,
  testIDPrefix = 'voice-recorder',
  onDiscard,
  onTogglePause,
  onSend,
  style,
}: VoiceNoteRecorderBarProps) {
  const { colors, isDark } = useTheme();
  const { elapsedMs, isPaused, isRunning, start, reset, toggle } = useStopwatch({
    initialMs: initialElapsedMs,
  });

  // Start recording when component becomes visible
  useEffect(() => {
    if (visible) {
      start(initialElapsedMs);
    } else {
      reset();
    }
  }, [visible, initialElapsedMs, start, reset]);

  // Handlers
  const handleDiscard = useCallback(() => {
    reset();
    onDiscard();
  }, [reset, onDiscard]);

  const handleTogglePause = useCallback(() => {
    toggle();
    if (isRunning) {
      onTogglePause?.(true);
    } else if (isPaused) {
      onTogglePause?.(false);
    }
  }, [toggle, isRunning, isPaused, onTogglePause]);

  const handleSend = useCallback(() => {
    const durationMs = elapsedMs;
    reset();
    onSend({ durationMs });
  }, [elapsedMs, reset, onSend]);

  // Memoized icons
  const trashIcon = useMemo(
    () => <Feather name="trash-2" size={SPACING.iconSize} color={COLORS.iconWhite} />,
    []
  );

  const pauseIcon = useMemo(
    () => (
      <Ionicons
        name={isPaused ? 'play' : 'pause'}
        size={SPACING.iconSize}
        color={COLORS.pauseButton}
      />
    ),
    [isPaused]
  );

  const sendIcon = useMemo(
    () => <Ionicons name="send" size={SPACING.iconSize} color={COLORS.iconWhite} />,
    []
  );

  // Container styles with dynamic theming
  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        backgroundColor: isDark ? colors.surface : colors.background,
        paddingBottom: safeAreaBottomInset + SPACING.containerPadding + SPACING.bottomPadding,
        borderTopColor: colors.border,
      },
      style,
    ],
    [isDark, colors.surface, colors.background, colors.border, safeAreaBottomInset, style]
  );

  const timerTextStyle = useMemo(() => [styles.timerText, { color: colors.text }], [colors.text]);

  if (!visible) {
    return null;
  }

  return (
    <View style={containerStyle}>
      {/* Top row: Timer and dotted line */}
      <View style={styles.topRow}>
        <Text
          style={timerTextStyle}
          testID={`${testIDPrefix}-timer`}
          accessibilityLabel={`Recording time: ${formatTime(elapsedMs)}`}
          accessibilityRole="timer"
        >
          {formatTime(elapsedMs)}
        </Text>
        <DottedLine dotCount={35} />
      </View>

      {/* Bottom row: Controls */}
      <View style={styles.controlsRow}>
        {/* Trash button */}
        <IconButton
          icon={trashIcon}
          onPress={handleDiscard}
          accessibilityLabel="Discard recording"
          testID={`${testIDPrefix}-trash`}
        />

        {/* Pause/Resume button */}
        <CircularButton
          icon={pauseIcon}
          backgroundColor="transparent"
          borderColor={COLORS.pauseButton}
          borderWidth={2}
          onPress={handleTogglePause}
          accessibilityLabel={isPaused ? 'Resume recording' : 'Pause recording'}
          testID={`${testIDPrefix}-pause`}
        />

        {/* Send button */}
        <CircularButton
          icon={sendIcon}
          backgroundColor={COLORS.sendButton}
          onPress={handleSend}
          accessibilityLabel="Send voice note"
          testID={`${testIDPrefix}-send`}
        />
      </View>
    </View>
  );
});

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: SPACING.containerPadding,
    paddingHorizontal: SPACING.containerPadding,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  timerText: {
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 50,
  },
  dottedLineContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  dot: {
    width: SPACING.dotSize,
    height: SPACING.dotSize,
    borderRadius: SPACING.dotSize / 2,
    backgroundColor: COLORS.dottedLine,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
});

export default VoiceNoteRecorderBar;
