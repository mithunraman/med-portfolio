import { type Message, isTerminalMessageStatus } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { formatTime } from '../../../utils/formatTime';
import { CircularButton } from '../../CircularButton';
import { useAudioPlayback } from '../hooks/useAudioPlayback';

const BAR_COUNT = 30;

// Generate pseudo-random bar heights seeded from message id characters
function generateBars(seed: string): number[] {
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const charCode = seed.charCodeAt(i % seed.length) + i * 7;
    bars.push(4 + (charCode % 21)); // range 4–24
  }
  return bars;
}

interface Props {
  message: Message;
}

export const AudioContent = memo(function AudioContent({ message }: Props) {
  const { colors } = useTheme();
  const audioUrl = message.media?.audioUrl ?? null;

  const { isPlaying, isLoaded, currentMs, durationMs, play, pause, toggleSpeed, speed } =
    useAudioPlayback(audioUrl);

  const bars = useMemo(() => generateBars(message.id), [message.id]);

  // `audioUrl` is null for two unrelated reasons and they need opposite treatment:
  //
  //   "gone"    — the 72h retention sweep deleted the recording, so the backend
  //               stops issuing playback URLs (resolveAudioUrl returns null for
  //               any media no longer ATTACHED). Nothing will ever play again.
  //   "not yet" — the URL simply hasn't been issued. sendMessage deliberately
  //               returns audioUrl: null while the audio is still PENDING, and an
  //               optimistic bubble has no media at all. The next GET /messages
  //               poll supplies one.
  //
  // Status is what separates them. Hiding the pill on "not yet" would remove the
  // only sign the message is a voice note between tap-send and the first poll —
  // and indefinitely for a failed send, where the bubble is also the retry target.
  const recordingGone = !audioUrl && isTerminalMessageStatus(message.status);

  // Playback controls are rendered only when there is something to play. Without
  // this the in-flight pill carries a play button that silently does nothing,
  // which is what `useAudioPlayback(null)` yields.
  const canPlay = audioUrl !== null;

  // Before the source loads the hook reports 0, which would render a misleading
  // "0:00" on a recording that has a known length. The DTO carries it from the
  // moment the message reaches the server, so prefer that until playback starts.
  const totalMs = durationMs || message.media?.durationMs || 0;

  const playheadFraction = durationMs > 0 ? currentMs / durationMs : 0;
  const filledBars = Math.floor(playheadFraction * BAR_COUNT);

  const handleTogglePlay = () => {
    if (isPlaying) pause();
    else play();
  };

  const playIcon = <Ionicons name={isPlaying ? 'pause' : 'play'} size={14} color="#ffffff" />;

  return (
    <View style={styles.wrapper}>
      {/* Text message - primary focus */}
      {message.content ? (
        <Text style={[styles.textContent, { color: colors.text }]}>{message.content}</Text>
      ) : null}

      {/* Compact audio player pill. Shown whenever the recording still exists —
          including while it is uploading or awaiting its first playback URL, when
          the waveform is the only thing marking this as a voice note. Dropped only
          once the retention sweep has deleted the recording for good, at which
          point the transcript above is the message. */}
      {!recordingGone ? (
        <View style={[styles.container, { backgroundColor: colors.border }]}>
          {/* Play / pause button — omitted while there is nothing to play. */}
          {canPlay ? (
            <CircularButton
              icon={playIcon}
              backgroundColor={colors.primary}
              onPress={handleTogglePlay}
              accessibilityLabel={isPlaying ? 'Pause audio' : 'Play audio'}
              size={28}
            />
          ) : null}

          {/* Waveform + duration row */}
          <View style={styles.middle}>
            {/* Waveform bars */}
            <View style={styles.waveform}>
              {bars.map((height, index) => (
                <View
                  key={index}
                  style={[
                    styles.bar,
                    {
                      height: Math.round(height * 0.5),
                      backgroundColor: index < filledBars ? colors.primary : colors.textSecondary,
                    },
                  ]}
                />
              ))}
            </View>

            {/* Duration countdown — omitted while the length is genuinely unknown.
                An optimistic bubble has no media yet, so there is nothing to read
                a length from, and "0:00" would assert an empty recording. */}
            {totalMs > 0 ? (
              <Text style={[styles.duration, { color: colors.textSecondary }]}>
                {formatTime(totalMs - currentMs)}
              </Text>
            ) : null}
          </View>

          {/* Speed toggle — useless without a loaded source, so it follows the
              play button rather than sitting there inert. */}
          {canPlay ? (
            <Pressable
              onPress={toggleSpeed}
              style={styles.speedChip}
              accessibilityLabel="Playback speed"
              accessibilityRole="button"
            >
              <Text style={[styles.speedText, { color: colors.textSecondary }]}>{speed}×</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  textContent: {
    fontSize: 16,
    lineHeight: 20,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 20,
  },
  middle: {
    gap: 2,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 14,
  },
  bar: {
    width: 2,
    borderRadius: 1,
  },
  duration: {
    fontSize: 10,
  },
  speedChip: {
    paddingHorizontal: 4,
  },
  speedText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
