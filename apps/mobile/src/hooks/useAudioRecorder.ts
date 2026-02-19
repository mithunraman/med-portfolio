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

export const MAX_RECORDING_DURATION = 120; // 2 minutes

export type AudioRecordingResult = {
  uri: string;
  mime: string;
  duration: number;
};

export type AudioPermissionStatus = 'granted' | 'denied' | 'undetermined';

export function useAudioRecorder() {
  const [permissionStatus, setPermissionStatus] = useState<AudioPermissionStatus>('undetermined');
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
    } finally {
      isStartingRef.current = false;
    }
  }, [recorder, isRecording]);

  const stopRecording = useCallback(async (): Promise<AudioRecordingResult | null> => {
    // Invalidate any in-flight start operations
    startIdRef.current++;

    if (!isRecording) return null;

    // Capture duration before stopping
    const finalDuration = duration;

    try {
      await recorder.stop();
    } catch {
      return null;
    }

    const uri = recorder.uri;

    // Minimum 1 second recording
    if (finalDuration < 1 || !uri) {
      return null;
    }

    return { uri, mime: 'audio/mp4', duration: finalDuration };
  }, [recorder, isRecording, duration]);

  const cancelRecording = useCallback(async () => {
    // Invalidate any in-flight start operations
    startIdRef.current++;

    if (isRecording) {
      try {
        await recorder.stop();
      } catch {
        // Recorder may already be stopped — safe to ignore
      }
    }
  }, [recorder, isRecording]);

  return {
    isRecording,
    duration,
    permissionStatus,
    startRecording,
    stopRecording,
    cancelRecording,
    checkAndRequestPermission,
    getPermissionStatus,
  };
}
