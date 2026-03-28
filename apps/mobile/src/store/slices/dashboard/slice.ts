import type { DashboardResponse } from '@acme/shared';
import { createSlice } from '@reduxjs/toolkit';
import { fetchInit } from './thunks';

interface DashboardState {
  data: DashboardResponse | null;
  loading: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  data: null,
  loading: false,
  error: null,
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearDashboard(state) {
      state.data = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInit.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchInit.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload.dashboard;
      })
      .addCase(fetchInit.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearDashboard } = dashboardSlice.actions;
export default dashboardSlice.reducer;
