import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  MAX_RECORDING_DURATION,
  useAudioRecorder,
  type AudioRecordingResult,
} from '../hooks/useAudioRecorder';
import { useTheme } from '../theme';
import { formatSeconds } from '../utils/formatTime';
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
  warningText: '#f59e0b',
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
  /** Bottom safe area inset */
  safeAreaBottomInset?: number;
  /** Prefix for testIDs */
  testIDPrefix?: string;
  /** Called when user discards the recording */
  onDiscard: () => void;
  /** Called when user sends the recording */
  onSend: (result: AudioRecordingResult) => void;
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
// PERMISSION DENIED VIEW
// ============================================================================

const PermissionDeniedView = memo(function PermissionDeniedView({
  onDismiss,
  testIDPrefix,
}: {
  onDismiss: () => void;
  testIDPrefix: string;
}) {
  const { colors } = useTheme();

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return (
    <View style={styles.deniedContainer}>
      <MaterialIcons name="mic-off" size={32} color={colors.textSecondary} />
      <Text style={[styles.deniedText, { color: colors.text }]}>
        Microphone access is required to record voice notes
      </Text>
      <Pressable
        onPress={handleOpenSettings}
        style={[styles.settingsButton, { borderColor: colors.primary }]}
        testID={`${testIDPrefix}-open-settings`}
      >
        <Text style={[styles.settingsButtonText, { color: colors.primary }]}>Open Settings</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        style={styles.dismissButton}
        testID={`${testIDPrefix}-dismiss`}
      >
        <Text style={[styles.dismissButtonText, { color: colors.textSecondary }]}>Dismiss</Text>
      </Pressable>
    </View>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const VoiceNoteRecorderBar = memo(function VoiceNoteRecorderBar({
  visible,
  safeAreaBottomInset = 0,
  testIDPrefix = 'voice-recorder',
  onDiscard,
  onSend,
  style,
}: VoiceNoteRecorderBarProps) {
  const { colors, isDark } = useTheme();
  const {
    isRecording,
    duration,
    permissionStatus,
    startRecording,
    stopRecording,
    cancelRecording,
    checkAndRequestPermission,
    getPermissionStatus,
  } = useAudioRecorder();

  const [maxDurationReached, setMaxDurationReached] = useState(false);
  const stoppedResultRef = useRef<AudioRecordingResult | null>(null);
  const hasStartedRef = useRef(false);

  // Start recording when component becomes visible
  useEffect(() => {
    if (!visible) {
      hasStartedRef.current = false;
      stoppedResultRef.current = null;
      setMaxDurationReached(false);
      return;
    }

    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    (async () => {
      const status = await getPermissionStatus();

      if (status === 'granted') {
        await startRecording();
      } else if (status === 'undetermined') {
        const granted = await checkAndRequestPermission();
        if (granted) {
          await startRecording();
        }
      }
      // If 'denied', the component will render the denied view
    })();
  }, [visible, getPermissionStatus, checkAndRequestPermission, startRecording]);

  // Auto-stop at max duration
  useEffect(() => {
    if (isRecording && duration >= MAX_RECORDING_DURATION) {
      setMaxDurationReached(true);
      stopRecording()
        .then((result) => {
          stoppedResultRef.current = result;
        })
        .catch(() => {
          // Stop failed — user can still retry via send button
        });
    }
  }, [isRecording, duration, stopRecording]);

  // Handlers
  const handleDiscard = useCallback(async () => {
    stoppedResultRef.current = null;
    await cancelRecording();
    onDiscard();
  }, [cancelRecording, onDiscard]);

  const handleSend = useCallback(async () => {
    // If recording was already auto-stopped, use the saved result
    if (maxDurationReached && stoppedResultRef.current) {
      const result = stoppedResultRef.current;
      stoppedResultRef.current = null;
      onSend(result);
      return;
    }

    const result = await stopRecording();
    if (result) {
      onSend(result);
    } else {
      // Recording too short or failed
      onDiscard();
    }
  }, [stopRecording, onSend, onDiscard, maxDurationReached]);

  // Memoized icons
  const trashIcon = useMemo(
    () => <Feather name="trash-2" size={SPACING.iconSize} color={COLORS.iconWhite} />,
    []
  );

  const pauseIcon = useMemo(
    () => (
      <Ionicons
        name="pause"
        size={SPACING.iconSize}
        color={COLORS.pauseButton}
      />
    ),
    []
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

  // Permission denied state
  if (permissionStatus === 'denied') {
    return (
      <View style={containerStyle}>
        <PermissionDeniedView onDismiss={onDiscard} testIDPrefix={testIDPrefix} />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      {/* Top row: Timer and dotted line */}
      <View style={styles.topRow}>
        <Text
          style={timerTextStyle}
          testID={`${testIDPrefix}-timer`}
          accessibilityLabel={`Recording time: ${formatSeconds(duration)}`}
          accessibilityRole="timer"
        >
          {formatSeconds(duration)}
        </Text>
        <DottedLine dotCount={35} />
      </View>

      {/* Max duration warning */}
      {maxDurationReached && (
        <Text style={[styles.maxDurationText, { color: COLORS.warningText }]}>
          Max duration reached
        </Text>
      )}

      {/* Bottom row: Controls */}
      <View style={styles.controlsRow}>
        {/* Trash button */}
        <IconButton
          icon={trashIcon}
          onPress={handleDiscard}
          accessibilityLabel="Discard recording"
          testID={`${testIDPrefix}-trash`}
        />

        {/* Pause/Resume button (non-functional for now) */}
        <CircularButton
          icon={pauseIcon}
          backgroundColor="transparent"
          borderColor={COLORS.pauseButton}
          borderWidth={2}
          onPress={() => {}}
          accessibilityLabel="Pause recording"
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
  maxDurationText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
  },
  deniedContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  deniedText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  settingsButton: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 4,
  },
  settingsButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 8,
  },
  dismissButtonText: {
    fontSize: 13,
  },
});

export default VoiceNoteRecorderBar;
