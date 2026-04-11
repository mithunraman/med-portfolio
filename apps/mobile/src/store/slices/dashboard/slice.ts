import type { ActiveReviewPeriodSummary } from '@acme/shared';
import { createSlice } from '@reduxjs/toolkit';
import { fetchInit } from './thunks';

/**
 * Fulfilled action type prefixes for mutations that affect dashboard data.
 * When any of these succeed, the dashboard is marked stale so it refetches on next focus.
 *
 * Artefact and PDP goal mutations are NOT listed here — both are normalized
 * into their entity slices, so updates are reflected immediately without refetch.
 */
const DASHBOARD_INVALIDATING_PREFIXES = [
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
  /** Recent entries — normalized: only IDs stored here, entities in artefacts slice. */
  recentEntryIds: string[] | null;
  recentEntriesTotal: number;
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
  recentEntryIds: null,
  recentEntriesTotal: 0,
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
      state.recentEntryIds = null;
      state.recentEntriesTotal = 0;
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
          state.recentEntryIds = dashboard.recentEntries.items.map((a) => a.id);
          state.recentEntriesTotal = dashboard.recentEntries.total;
          state.pdpGoalsDueIds = dashboard.pdpGoalsDue.items.map((g) => g.id);
          state.pdpGoalsDueTotal = dashboard.pdpGoalsDue.total;
          state.activeReviewPeriod = dashboard.activeReviewPeriod;
        } else {
          state.recentEntryIds = null;
          state.recentEntriesTotal = 0;
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
