import type { PdpGoalResponse } from '@acme/shared';
import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../index';
import {
  addPdpGoalAction,
  fetchPdpGoal,
  fetchPdpGoals,
  updatePdpGoal,
  updatePdpGoalAction,
} from './thunks';

const pdpGoalsAdapter = createEntityAdapter<PdpGoalResponse>();

export interface PdpGoalsState {
  loading: boolean;
  mutating: boolean;
  error: string | null;
  total: number;
}

const pdpGoalsSlice = createSlice({
  name: 'pdpGoals',
  initialState: pdpGoalsAdapter.getInitialState<PdpGoalsState>({
    loading: false,
    mutating: false,
    error: null,
    total: 0,
  }),
  reducers: {
    clearPdpGoalsError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchPdpGoals
      .addCase(fetchPdpGoals.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPdpGoals.fulfilled, (state, action) => {
        state.loading = false;
        state.total = action.payload.total;
        pdpGoalsAdapter.setAll(state, action.payload.goals);
      })
      .addCase(fetchPdpGoals.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // fetchPdpGoal
      .addCase(fetchPdpGoal.fulfilled, (state, action) => {
        pdpGoalsAdapter.upsertOne(state, action.payload);
      })

      // updatePdpGoal
      .addCase(updatePdpGoal.pending, (state) => {
        state.mutating = true;
        state.error = null;
      })
      .addCase(updatePdpGoal.fulfilled, (state, action) => {
        state.mutating = false;
        pdpGoalsAdapter.upsertOne(state, action.payload);
      })
      .addCase(updatePdpGoal.rejected, (state, action) => {
        state.mutating = false;
        state.error = action.payload as string;
      })

      // addPdpGoalAction
      .addCase(addPdpGoalAction.pending, (state) => {
        state.mutating = true;
        state.error = null;
      })
      .addCase(addPdpGoalAction.fulfilled, (state, action) => {
        state.mutating = false;
        pdpGoalsAdapter.upsertOne(state, action.payload);
      })
      .addCase(addPdpGoalAction.rejected, (state, action) => {
        state.mutating = false;
        state.error = action.payload as string;
      })

      // updatePdpGoalAction
      .addCase(updatePdpGoalAction.pending, (state) => {
        state.mutating = true;
        state.error = null;
      })
      .addCase(updatePdpGoalAction.fulfilled, (state, action) => {
        state.mutating = false;
        pdpGoalsAdapter.upsertOne(state, action.payload);
      })
      .addCase(updatePdpGoalAction.rejected, (state, action) => {
        state.mutating = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearPdpGoalsError } = pdpGoalsSlice.actions;

export const {
  selectAll: selectAllPdpGoals,
  selectById: selectPdpGoalById,
} = pdpGoalsAdapter.getSelectors((state: RootState) => state.pdpGoals);

export default pdpGoalsSlice.reducer;
