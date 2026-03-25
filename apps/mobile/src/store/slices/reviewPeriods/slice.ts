import type { CoverageResponse, ReviewPeriod } from '@acme/shared';
import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../index';
import {
  archiveReviewPeriod,
  createReviewPeriod,
  fetchCoverage,
  fetchReviewPeriods,
  updateReviewPeriod,
} from './thunks';

const reviewPeriodsAdapter = createEntityAdapter<ReviewPeriod>();

export interface ReviewPeriodsState {
  loading: boolean;
  mutating: boolean;
  error: string | null;
  coverageByXid: Record<string, CoverageResponse>;
  coverageLoading: boolean;
}

const reviewPeriodsSlice = createSlice({
  name: 'reviewPeriods',
  initialState: reviewPeriodsAdapter.getInitialState<ReviewPeriodsState>({
    loading: false,
    mutating: false,
    error: null,
    coverageByXid: {},
    coverageLoading: false,
  }),
  reducers: {},
  extraReducers: (builder) => {
    builder
      // fetchReviewPeriods
      .addCase(fetchReviewPeriods.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchReviewPeriods.fulfilled, (state, action) => {
        state.loading = false;
        reviewPeriodsAdapter.setAll(state, action.payload.reviewPeriods);
      })
      .addCase(fetchReviewPeriods.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // createReviewPeriod
      .addCase(createReviewPeriod.pending, (state) => {
        state.mutating = true;
        state.error = null;
      })
      .addCase(createReviewPeriod.fulfilled, (state, action) => {
        state.mutating = false;
        reviewPeriodsAdapter.addOne(state, action.payload);
      })
      .addCase(createReviewPeriod.rejected, (state, action) => {
        state.mutating = false;
        state.error = action.payload as string;
      })

      // updateReviewPeriod
      .addCase(updateReviewPeriod.pending, (state) => {
        state.mutating = true;
        state.error = null;
      })
      .addCase(updateReviewPeriod.fulfilled, (state, action) => {
        state.mutating = false;
        reviewPeriodsAdapter.upsertOne(state, action.payload);
      })
      .addCase(updateReviewPeriod.rejected, (state, action) => {
        state.mutating = false;
        state.error = action.payload as string;
      })

      // archiveReviewPeriod
      .addCase(archiveReviewPeriod.pending, (state) => {
        state.mutating = true;
        state.error = null;
      })
      .addCase(archiveReviewPeriod.fulfilled, (state, action) => {
        state.mutating = false;
        reviewPeriodsAdapter.upsertOne(state, action.payload);
      })
      .addCase(archiveReviewPeriod.rejected, (state, action) => {
        state.mutating = false;
        state.error = action.payload as string;
      })

      // fetchCoverage
      .addCase(fetchCoverage.pending, (state) => {
        state.coverageLoading = true;
      })
      .addCase(fetchCoverage.fulfilled, (state, action) => {
        state.coverageLoading = false;
        state.coverageByXid[action.payload.xid] = action.payload.coverage;
      })
      .addCase(fetchCoverage.rejected, (state) => {
        state.coverageLoading = false;
      });
  },
});


export const {
  selectAll: selectAllReviewPeriods,
  selectById: selectReviewPeriodById,
} = reviewPeriodsAdapter.getSelectors((state: RootState) => state.reviewPeriods);

export default reviewPeriodsSlice.reducer;
