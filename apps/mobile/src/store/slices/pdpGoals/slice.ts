import type { PdpGoalResponse } from '@acme/shared';
import { createEntityAdapter, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../index';
import { finaliseArtefact } from '../artefacts/thunks';
import { fetchInit } from '../dashboard/thunks';
import { deleteArtefact } from '../artefacts/thunks';
import { deleteConversation } from '../conversations/thunks';
import {
  addPdpGoalAction,
  deletePdpGoal,
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
  stale: boolean;
}

const pdpGoalsSlice = createSlice({
  name: 'pdpGoals',
  initialState: pdpGoalsAdapter.getInitialState<PdpGoalsState>({
    loading: false,
    mutating: false,
    error: null,
    total: 0,
    stale: false,
  }),
  reducers: {
    markPdpGoalsStale(state) {
      state.stale = true;
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
        state.stale = false;
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

      // Cross-slice hydration: populate entity store from dashboard init response.
      // Dashboard returns PdpGoal (no artefactId/artefactTitle), but the adapter
      // stores PdpGoalResponse. For existing entities we merge (preserving artefact
      // fields); for new entities we insert with placeholder artefact fields.
      .addCase(fetchInit.fulfilled, (state, action) => {
        const items = action.payload.dashboard?.pdpGoalsDue.items;
        if (items?.length) {
          for (const item of items) {
            const existing = state.entities[item.id];
            if (existing) {
              pdpGoalsAdapter.updateOne(state, { id: item.id, changes: item });
            } else {
              pdpGoalsAdapter.addOne(state, {
                ...item,
                artefactId: '',
                artefactTitle: null,
              });
            }
          }
        }
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
      })

      // deletePdpGoal
      .addCase(deletePdpGoal.pending, (state) => {
        state.mutating = true;
        state.error = null;
      })
      .addCase(deletePdpGoal.fulfilled, (state, action) => {
        state.mutating = false;
        pdpGoalsAdapter.removeOne(state, action.payload);
        state.total = Math.max(0, state.total - 1);
      })
      .addCase(deletePdpGoal.rejected, (state, action) => {
        state.mutating = false;
        state.error = action.payload as string;
      })

      // Cross-slice: finalising an artefact creates/archives PDP goals server-side.
      .addCase(finaliseArtefact.fulfilled, (state) => {
        state.stale = true;
      })

      // Cross-slice: deleting an artefact cascades to its PDP goals server-side.
      .addCase(deleteArtefact.fulfilled, (state) => {
        state.stale = true;
      })

      // Cross-slice: deleting a conversation cascades to artefact + PDP goals.
      .addCase(deleteConversation.fulfilled, (state) => {
        state.stale = true;
      });
  },
});

export const { markPdpGoalsStale } = pdpGoalsSlice.actions;

export const {
  selectAll: selectAllPdpGoals,
  selectById: selectPdpGoalById,
} = pdpGoalsAdapter.getSelectors((state: RootState) => state.pdpGoals);

/** Joins dashboard PDP goal IDs with the normalized entity store. */
export const selectPdpGoalsDueSoon = createSelector(
  [
    (state: RootState) => state.dashboard.pdpGoalsDueIds,
    (state: RootState) => state.pdpGoals.entities,
  ],
  (ids, entities) =>
    (ids ?? []).map((id) => entities[id]).filter((g): g is PdpGoalResponse => !!g)
);

export const selectPdpGoalsDueTotal = (state: RootState) =>
  state.dashboard.pdpGoalsDueTotal ?? 0;

export default pdpGoalsSlice.reducer;
