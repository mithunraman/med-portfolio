import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../../api/client';
import { logger } from '../../../utils/logger';

const dashboardLogger = logger.createScope('DashboardThunks');

export const fetchDashboard = createAsyncThunk(
  'dashboard/fetchDashboard',
  async (_: void, { rejectWithValue }) => {
    dashboardLogger.info('Fetching dashboard');

    try {
      const response = await api.dashboard.getDashboard();
      dashboardLogger.info('Dashboard fetched', {
        recentEntries: response.recentEntries.items.length,
        pdpActions: response.pdpActionsDue.items.length,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch dashboard';
      dashboardLogger.error('Failed to fetch dashboard', { error: message });
      return rejectWithValue(message);
    }
  }
);
