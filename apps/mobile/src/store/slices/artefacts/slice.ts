import type { Artefact } from '@acme/shared';
import { createEntityAdapter, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../index';
import { fetchInit } from '../dashboard/thunks';
import {
  createArtefact,
  duplicateToReview,
  editArtefact,
  fetchArtefact,
  fetchArtefacts,
  finaliseArtefact,
  restoreVersion,
  updateArtefactStatus,
} from './thunks';

const artefactsAdapter = createEntityAdapter<Artefact>({
  sortComparer: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
});

export interface ArtefactsState {
  creatingArtefact: boolean;
  loading: boolean;
  updatingStatus: boolean;
  saving: boolean;
  error: string | null;
  nextCursor: string | null;
}

const artefactsSlice = createSlice({
  name: 'artefacts',
  initialState: artefactsAdapter.getInitialState<ArtefactsState>({
    creatingArtefact: false,
    loading: false,
    updatingStatus: false,
    saving: false,
    error: null,
    nextCursor: null,
  }),
  reducers: {},
  extraReducers: (builder) => {
    builder
      // createArtefact
      .addCase(createArtefact.pending, (state) => {
        state.creatingArtefact = true;
        state.error = null;
      })
      .addCase(createArtefact.fulfilled, (state, action) => {
        state.creatingArtefact = false;
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(createArtefact.rejected, (state, action) => {
        state.creatingArtefact = false;
        state.error = action.payload as string;
      })
      // fetchArtefacts
      .addCase(fetchArtefacts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchArtefacts.fulfilled, (state, action) => {
        state.loading = false;
        state.nextCursor = action.payload.nextCursor;
        // If no cursor was provided in the request, this is a fresh fetch — replace all
        if (!action.meta.arg?.cursor) {
          artefactsAdapter.setAll(state, action.payload.artefacts);
        } else {
          artefactsAdapter.upsertMany(state, action.payload.artefacts);
        }
      })
      .addCase(fetchArtefacts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // fetchArtefact (single)
      .addCase(fetchArtefact.fulfilled, (state, action) => {
        artefactsAdapter.upsertOne(state, action.payload);
      })
      // updateArtefactStatus
      .addCase(updateArtefactStatus.pending, (state) => {
        state.updatingStatus = true;
        state.error = null;
      })
      .addCase(updateArtefactStatus.fulfilled, (state, action) => {
        state.updatingStatus = false;
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(updateArtefactStatus.rejected, (state, action) => {
        state.updatingStatus = false;
        state.error = action.payload as string;
      })
      // finaliseArtefact
      .addCase(finaliseArtefact.pending, (state) => {
        state.updatingStatus = true;
        state.error = null;
      })
      .addCase(finaliseArtefact.fulfilled, (state, action) => {
        state.updatingStatus = false;
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(finaliseArtefact.rejected, (state, action) => {
        state.updatingStatus = false;
        state.error = action.payload as string;
      })
      // duplicateToReview
      .addCase(duplicateToReview.pending, (state) => {
        state.updatingStatus = true;
        state.error = null;
      })
      .addCase(duplicateToReview.fulfilled, (state, action) => {
        state.updatingStatus = false;
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(duplicateToReview.rejected, (state, action) => {
        state.updatingStatus = false;
        state.error = action.payload as string;
      })
      // editArtefact
      .addCase(editArtefact.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(editArtefact.fulfilled, (state, action) => {
        state.saving = false;
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(editArtefact.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      })
      // Cross-slice hydration: populate entity store from dashboard init response.
      // Artefact type is identical between dashboard and entity store — simple upsertMany.
      .addCase(fetchInit.fulfilled, (state, action) => {
        const items = action.payload.dashboard?.recentEntries.items;
        if (items?.length) {
          artefactsAdapter.upsertMany(state, items);
        }
      })
      // restoreVersion
      .addCase(restoreVersion.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(restoreVersion.fulfilled, (state, action) => {
        state.saving = false;
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(restoreVersion.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  selectAll: selectAllArtefacts,
  selectById: selectArtefactById,
  selectIds: selectArtefactIds,
} = artefactsAdapter.getSelectors((state: RootState) => state.artefacts);

/** Joins dashboard recent entry IDs with the normalized entity store. */
export const selectRecentEntries = createSelector(
  [
    (state: RootState) => state.dashboard.recentEntryIds,
    (state: RootState) => state.artefacts.entities,
  ],
  (ids, entities) =>
    (ids ?? []).map((id) => entities[id]).filter((a): a is Artefact => !!a)
);

export const selectRecentEntriesTotal = (state: RootState) =>
  state.dashboard.recentEntriesTotal ?? 0;

export default artefactsSlice.reducer;
