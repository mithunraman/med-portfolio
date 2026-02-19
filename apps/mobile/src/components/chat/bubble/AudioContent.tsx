import { MessageProcessingStatus, PROCESSING_STATUS_LABELS, type Message } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../theme';
import { formatTime } from '../../../utils/formatTime';
import { CircularButton } from '../../CircularButton';
import { useAudioPlayback } from '../hooks/useAudioPlayback';

const BAR_COUNT = 30;
const TERMINAL = new Set([MessageProcessingStatus.COMPLETE, MessageProcessingStatus.FAILED]);

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

  const isProcessing = !TERMINAL.has(message.processingStatus);
  const statusLabel = isProcessing ? PROCESSING_STATUS_LABELS[message.processingStatus] : null;

  const playheadFraction = durationMs > 0 ? currentMs / durationMs : 0;
  const filledBars = Math.floor(playheadFraction * BAR_COUNT);

  const handleTogglePlay = () => {
    if (isPlaying) pause();
    else play();
  };

  const playIcon = <Ionicons name={isPlaying ? 'pause' : 'play'} size={14} color="#ffffff" />;

  if (statusLabel) {
    return (
      <Text style={[styles.processingText, { color: colors.textSecondary }]}>{statusLabel}</Text>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Text message — primary focus */}
      {message.content ? (
        <Text style={[styles.textContent, { color: colors.text }]}>{message.content}</Text>
      ) : null}

      {/* Compact audio player pill */}
      <View style={[styles.container, { backgroundColor: colors.border }]}>
        {/* Play / pause button */}
        <CircularButton
          icon={playIcon}
          backgroundColor={colors.primary}
          onPress={handleTogglePlay}
          accessibilityLabel={isPlaying ? 'Pause audio' : 'Play audio'}
          size={28}
        />

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

          {/* Duration countdown */}
          <Text style={[styles.duration, { color: colors.textSecondary }]}>
            {formatTime(durationMs - currentMs)}
          </Text>
        </View>

        {/* Speed toggle */}
        <Pressable
          onPress={toggleSpeed}
          style={styles.speedChip}
          accessibilityLabel="Playback speed"
          accessibilityRole="button"
        >
          <Text style={[styles.speedText, { color: colors.textSecondary }]}>{speed}×</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  textContent: {
    fontSize: 14,
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
  processingText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
