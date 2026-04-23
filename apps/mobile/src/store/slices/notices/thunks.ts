import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';
import { dismissUpdateVersion, removeNotice, setDismissedUpdateVersion } from './slice';

const noticesLogger = logger.createScope('NoticesThunks');

export const DISMISSED_UPDATE_VERSION_KEY = 'recommendedUpdate:dismissedVersion';

export const dismissNotice = createAsyncThunk(
  'notices/dismiss',
  async (noticeId: string, { dispatch }) => {
    // Optimistic removal
    dispatch(removeNotice(noticeId));

    try {
      await api.notices.dismiss(noticeId);
    } catch (error) {
      noticesLogger.warn('Failed to dismiss notice server-side', { noticeId, error: String(error) });
      // Don't re-add — self-heals on next init
    }
  }
);

export const loadDismissedUpdateVersion = createAsyncThunk(
  'notices/loadDismissedUpdateVersion',
  async (_, { dispatch }) => {
    try {
      const value = await AsyncStorage.getItem(DISMISSED_UPDATE_VERSION_KEY);
      dispatch(setDismissedUpdateVersion(value));
    } catch (error) {
      noticesLogger.warn('Failed to hydrate dismissed update version', { error: String(error) });
      // Fail open: on storage corruption, show the banner again rather than permanently hiding it.
      dispatch(setDismissedUpdateVersion(null));
    }
  }
);

export const dismissRecommendedUpdate = createAsyncThunk(
  'notices/dismissRecommendedUpdate',
  async (version: string, { dispatch }) => {
    dispatch(dismissUpdateVersion(version));
    try {
      await AsyncStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, version);
    } catch (error) {
      noticesLogger.warn('Failed to persist dismissed update version', {
        version,
        error: String(error),
      });
    }
  }
);
