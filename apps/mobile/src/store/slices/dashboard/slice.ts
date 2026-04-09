import type { DashboardResponse } from '@acme/shared';
import { createSlice } from '@reduxjs/toolkit';
import { fetchInit } from './thunks';

/**
 * Fulfilled action type prefixes for mutations that affect dashboard data.
 * When any of these succeed, the dashboard is marked stale so it refetches on next focus.
 */
const DASHBOARD_INVALIDATING_PREFIXES = [
  'artefacts/createArtefact',
  'artefacts/updateArtefactStatus',
  'artefacts/duplicateToReview',
  'artefacts/editArtefact',
  'artefacts/finaliseArtefact',
  'artefacts/restoreVersion',
  'messages/sendMessageWithRetry',
  'messages/retryFailedMessage',
  'messages/sendVoiceNoteWithRetry',
  'pdpGoals/updatePdpGoal',
  'pdpGoals/addPdpGoalAction',
  'pdpGoals/updatePdpGoalAction',
  'reviewPeriods/createReviewPeriod',
  'reviewPeriods/updateReviewPeriod',
  'reviewPeriods/archiveReviewPeriod',
];

function isDashboardInvalidatingAction(actionType: string): boolean {
  return DASHBOARD_INVALIDATING_PREFIXES.some((prefix) => actionType === `${prefix}/fulfilled`);
}

interface DashboardState {
  data: DashboardResponse | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
}

const initialState: DashboardState = {
  data: null,
  loading: false,
  error: null,
  stale: false,
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
        state.stale = false;
      })
      .addCase(fetchInit.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addMatcher(
        (action) => isDashboardInvalidatingAction(action.type),
        (state) => {
          state.stale = true;
        }
      );
  },
});

export const { clearDashboard } = dashboardSlice.actions;
export default dashboardSlice.reducer;
