import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useMemo } from 'react';

type PlaybackSpeed = 1 | 1.25 | 1.5 | 1.75 | 2;
const SPEED_CYCLE: PlaybackSpeed[] = [1, 1.25, 1.5, 1.75, 2];

interface AudioPlaybackResult {
  isPlaying: boolean;
  isLoaded: boolean;
  currentMs: number;
  durationMs: number;
  speed: PlaybackSpeed;
  play: () => void;
  pause: () => void;
  toggleSpeed: () => void;
}

export function useAudioPlayback(audioUrl: string | null | undefined): AudioPlaybackResult {
  const source = useMemo(() => (audioUrl ? { uri: audioUrl } : null), [audioUrl]);

  // useAudioPlayer handles resource cleanup on unmount and source changes
  const player = useAudioPlayer(source as Parameters<typeof useAudioPlayer>[0]);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);

  const play = useCallback(() => {
    player.play();
  }, [player]);

  const pause = useCallback(() => {
    player.pause();
  }, [player]);

  const toggleSpeed = useCallback(() => {
    const currentSpeed = (player.playbackRate ?? 1) as PlaybackSpeed;
    const currentIndex = SPEED_CYCLE.indexOf(currentSpeed);
    const nextSpeed = SPEED_CYCLE[(currentIndex + 1) % SPEED_CYCLE.length];
    player.setPlaybackRate(nextSpeed, 'high');
  }, [player]);

  const currentSpeed = (player.playbackRate ?? 1) as PlaybackSpeed;

  return {
    isPlaying: status.playing ?? false,
    isLoaded: status.isLoaded ?? false,
    currentMs: (status.currentTime ?? 0) * 1000,
    durationMs: (status.duration ?? 0) * 1000,
    speed: SPEED_CYCLE.includes(currentSpeed) ? currentSpeed : 1,
    play,
    pause,
    toggleSpeed,
  };
}
