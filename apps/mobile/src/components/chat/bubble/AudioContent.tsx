import {
  PROCESSING_STATUS_LABELS,
  type Message,
  MessageProcessingStatus,
} from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CircularButton } from '../../CircularButton';
import { useTheme } from '../../../theme';
import { formatTime } from '../../../utils/formatTime';
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

  const playIcon = (
    <Ionicons
      name={isPlaying ? 'pause' : 'play'}
      size={20}
      color="#ffffff"
    />
  );

  if (statusLabel) {
    return (
      <Text style={[styles.processingText, { color: colors.textSecondary }]}>{statusLabel}</Text>
    );
  }

  return (
    <View style={styles.container}>
      {/* Play / pause button */}
      <CircularButton
        icon={playIcon}
        backgroundColor={colors.primary}
        onPress={handleTogglePlay}
        accessibilityLabel={isPlaying ? 'Pause audio' : 'Play audio'}
        size={36}
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
                  height,
                  backgroundColor: index < filledBars ? colors.primary : colors.border,
                },
              ]}
            />
          ))}
        </View>

        {/* Duration */}
        <Text style={[styles.duration, { color: colors.textSecondary }]}>
          {formatTime(currentMs > 0 ? currentMs : durationMs)} /{' '}
          {formatTime(durationMs)}
        </Text>
      </View>

      {/* Speed toggle */}
      <Pressable onPress={toggleSpeed} style={styles.speedChip} accessibilityLabel="Playback speed">
        <Text style={[styles.speedText, { color: colors.textSecondary }]}>{speed}×</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
  },
  middle: {
    flex: 1,
    gap: 4,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 28,
  },
  bar: {
    width: 2,
    borderRadius: 1,
  },
  duration: {
    fontSize: 11,
  },
  speedChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  speedText: {
    fontSize: 12,
    fontWeight: '600',
  },
  processingText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
