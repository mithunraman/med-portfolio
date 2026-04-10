import type { ActiveReviewPeriodSummary, Artefact } from '@acme/shared';
import { createSlice } from '@reduxjs/toolkit';
import { fetchInit } from './thunks';

/**
 * Fulfilled action type prefixes for mutations that affect dashboard data.
 * When any of these succeed, the dashboard is marked stale so it refetches on next focus.
 *
 * PDP goal mutations are NOT listed here — PDP goals are normalized into the
 * pdpGoals entity slice, so updates are reflected immediately without refetch.
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
  'reviewPeriods/createReviewPeriod',
  'reviewPeriods/updateReviewPeriod',
  'reviewPeriods/archiveReviewPeriod',
];

function isDashboardInvalidatingAction(actionType: string): boolean {
  return DASHBOARD_INVALIDATING_PREFIXES.some((prefix) => actionType === `${prefix}/fulfilled`);
}

export interface DashboardState {
  /** Recent entries — still stored as full objects (future normalization phase). */
  recentEntries: { items: Artefact[]; total: number } | null;
  /** PDP goals due soon — normalized: only IDs stored here, entities in pdpGoals slice. */
  pdpGoalsDueIds: string[] | null;
  pdpGoalsDueTotal: number;
  /** Active review period — still stored as full object (future normalization phase). */
  activeReviewPeriod: ActiveReviewPeriodSummary | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
}

const initialState: DashboardState = {
  recentEntries: null,
  pdpGoalsDueIds: null,
  pdpGoalsDueTotal: 0,
  activeReviewPeriod: null,
  loading: false,
  error: null,
  stale: false,
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearDashboard(state) {
      state.recentEntries = null;
      state.pdpGoalsDueIds = null;
      state.pdpGoalsDueTotal = 0;
      state.activeReviewPeriod = null;
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
        const dashboard = action.payload.dashboard;
        if (dashboard) {
          state.recentEntries = dashboard.recentEntries;
          state.pdpGoalsDueIds = dashboard.pdpGoalsDue.items.map((g) => g.id);
          state.pdpGoalsDueTotal = dashboard.pdpGoalsDue.total;
          state.activeReviewPeriod = dashboard.activeReviewPeriod;
        } else {
          state.recentEntries = null;
          state.pdpGoalsDueIds = null;
          state.pdpGoalsDueTotal = 0;
          state.activeReviewPeriod = null;
        }
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
