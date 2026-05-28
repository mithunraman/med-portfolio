import {
  AudioModule,
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorderState,
  useAudioRecorder as useExpoAudioRecorder,
} from 'expo-audio';
import { PermissionStatus } from 'expo-modules-core';
import { useCallback, useRef, useState } from 'react';

export const MAX_RECORDING_DURATION = 180; // 3 minutes

export type AudioRecordingResult = {
  uri: string;
  mime: string;
  duration: number;
};

export type AudioPermissionStatus = 'granted' | 'denied' | 'undetermined';

export function useAudioRecorder() {
  const [permissionStatus, setPermissionStatus] = useState<AudioPermissionStatus>('undetermined');
  const [isPaused, setIsPaused] = useState(false);
  const isStartingRef = useRef(false);
  const startIdRef = useRef(0);

  const recorder = useExpoAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const isRecording = recorderState.isRecording;
  const duration = Math.floor(recorderState.durationMillis / 1000);

  // Note: No manual unmount cleanup needed — Expo's useReleasingSharedObject
  // (used internally by useExpoAudioRecorder) automatically releases the
  // native AudioRecorder and its resources when the component unmounts.

  // Check and request microphone permission
  const checkAndRequestPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await requestRecordingPermissionsAsync();
    const granted = status === PermissionStatus.GRANTED;
    setPermissionStatus(granted ? 'granted' : 'denied');
    return granted;
  }, []);

  // Check permission status without requesting
  const getPermissionStatus = useCallback(async (): Promise<AudioPermissionStatus> => {
    const { status } = await getRecordingPermissionsAsync();
    let result: AudioPermissionStatus;
    if (status === PermissionStatus.GRANTED) {
      result = 'granted';
    } else if (status === PermissionStatus.UNDETERMINED) {
      result = 'undetermined';
    } else {
      result = 'denied';
    }
    setPermissionStatus(result);
    return result;
  }, []);

  const startRecording = useCallback(async () => {
    // Prevent concurrent start attempts
    if (isStartingRef.current || isRecording) {
      return;
    }

    isStartingRef.current = true;
    const currentStartId = ++startIdRef.current;

    try {
      // iOS requires recording mode + silent mode override to be enabled together
      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      await recorder.prepareToRecordAsync();

      // Check if this start was cancelled while we were awaiting
      if (currentStartId !== startIdRef.current) {
        return;
      }

      recorder.record();
      setIsPaused(false);
    } finally {
      isStartingRef.current = false;
    }
  }, [recorder, isRecording]);

  const pauseRecording = useCallback(() => {
    if (!isRecording) return;
    try {
      recorder.pause();
      setIsPaused(true);
    } catch {
      // Pause not supported (e.g. Android <24) or recorder already stopped — ignore
    }
  }, [recorder, isRecording]);

  const resumeRecording = useCallback(() => {
    if (!isPaused) return;
    try {
      recorder.record();
      setIsPaused(false);
    } catch {
      // Recorder may have been released — ignore
    }
  }, [recorder, isPaused]);

  const stopRecording = useCallback(async (): Promise<AudioRecordingResult | null> => {
    // Invalidate any in-flight start operations
    startIdRef.current++;

    // Allow stopping when recording OR paused (a paused recorder still has a file to finalize)
    if (!isRecording && !isPaused) return null;

    // Capture duration before stopping
    const finalDuration = duration;

    try {
      await recorder.stop();
    } catch {
      setIsPaused(false);
      return null;
    }

    setIsPaused(false);
    const uri = recorder.uri;

    // Minimum 1 second recording
    if (finalDuration < 1 || !uri) {
      return null;
    }

    return { uri, mime: 'audio/mp4', duration: finalDuration };
  }, [recorder, isRecording, isPaused, duration]);

  const cancelRecording = useCallback(async () => {
    // Invalidate any in-flight start operations
    startIdRef.current++;

    if (isRecording || isPaused) {
      try {
        await recorder.stop();
      } catch {
        // Recorder may already be stopped — safe to ignore
      }
    }
    setIsPaused(false);
  }, [recorder, isRecording, isPaused]);

  return {
    isRecording,
    isPaused,
    duration,
    permissionStatus,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    checkAndRequestPermission,
    getPermissionStatus,
  };
}
