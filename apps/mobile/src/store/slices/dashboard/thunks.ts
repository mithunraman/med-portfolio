import type { InitResponse } from '@acme/shared';
import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { AppSecureStorage } from '../../../services';
import { logger } from '../../../utils/logger';
import { retryRead } from '../../../utils/retry';

const dashboardLogger = logger.createScope('DashboardThunks');

export const fetchInit = createAsyncThunk(
  'init/fetch',
  async (_: void, { rejectWithValue }) => {
    dashboardLogger.info('Fetching init');

    try {
      const response: InitResponse = await retryRead(() => api.init.getInit());

      dashboardLogger.info('Init fetched', {
        recentEntries: response.dashboard?.recentEntries.items.length ?? 0,
        pdpGoals: response.dashboard?.pdpGoalsDue.items.length ?? 0,
        hasDeletionScheduled: !!response.user.deletionScheduledFor,
      });

      // Persist fresh user profile to SecureStore
      const storedSession = await AppSecureStorage.get('user');
      if (storedSession) {
        await AppSecureStorage.set('user', { ...storedSession, user: response.user });
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch init';
      dashboardLogger.error('Failed to fetch init', { error: message });
      return rejectWithValue(message);
    }
  }
);
