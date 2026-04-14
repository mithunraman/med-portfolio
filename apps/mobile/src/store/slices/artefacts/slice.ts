import type { Artefact } from '@acme/shared';
import { createEntityAdapter, createSelector, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../index';
import { deleteConversation } from '../conversations/thunks';
import { fetchInit } from '../dashboard/thunks';
import {
  createArtefact,
  deleteArtefact,
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

export type EntityStatus = 'loading' | 'updating' | 'saving';

export interface ArtefactsState {
  creatingArtefact: boolean;
  loading: boolean;
  statusById: Record<string, EntityStatus>;
  error: string | null;
  nextCursor: string | null;
  stale: boolean;
}

const artefactsSlice = createSlice({
  name: 'artefacts',
  initialState: artefactsAdapter.getInitialState<ArtefactsState>({
    creatingArtefact: false,
    loading: false,
    statusById: {},
    error: null,
    nextCursor: null,
    stale: false,
  }),
  reducers: {
    markArtefactsStale(state) {
      state.stale = true;
    },
  },
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
        state.stale = false;
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
      .addCase(fetchArtefact.pending, (state, action) => {
        state.statusById[action.meta.arg.artefactId] = 'loading';
      })
      .addCase(fetchArtefact.fulfilled, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(fetchArtefact.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
      })
      // updateArtefactStatus
      .addCase(updateArtefactStatus.pending, (state, action) => {
        state.statusById[action.meta.arg.artefactId] = 'updating';
      })
      .addCase(updateArtefactStatus.fulfilled, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(updateArtefactStatus.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
      })
      // finaliseArtefact
      .addCase(finaliseArtefact.pending, (state, action) => {
        state.statusById[action.meta.arg.artefactId] = 'updating';
      })
      .addCase(finaliseArtefact.fulfilled, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
        state.stale = true;
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(finaliseArtefact.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
      })
      // duplicateToReview
      .addCase(duplicateToReview.pending, (state, action) => {
        state.statusById[action.meta.arg.artefactId] = 'updating';
      })
      .addCase(duplicateToReview.fulfilled, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(duplicateToReview.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
      })
      // editArtefact
      .addCase(editArtefact.pending, (state, action) => {
        state.statusById[action.meta.arg.artefactId] = 'saving';
      })
      .addCase(editArtefact.fulfilled, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(editArtefact.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
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
      .addCase(restoreVersion.pending, (state, action) => {
        state.statusById[action.meta.arg.artefactId] = 'saving';
      })
      .addCase(restoreVersion.fulfilled, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
        artefactsAdapter.upsertOne(state, action.payload);
      })
      .addCase(restoreVersion.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
      })
      // deleteArtefact
      .addCase(deleteArtefact.pending, (state, action) => {
        state.statusById[action.meta.arg.artefactId] = 'updating';
      })
      .addCase(deleteArtefact.fulfilled, (state, action) => {
        delete state.statusById[action.payload];
        artefactsAdapter.removeOne(state, action.payload);
      })
      .addCase(deleteArtefact.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
      })
      // Cross-slice: deleting a conversation cascades to its artefact server-side.
      .addCase(deleteConversation.fulfilled, (state) => {
        state.stale = true;
      });
  },
});

export const { markArtefactsStale } = artefactsSlice.actions;

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
  (ids, entities) => (ids ?? []).map((id) => entities[id]).filter((a): a is Artefact => !!a)
);

export const selectRecentEntriesTotal = (state: RootState) =>
  state.dashboard.recentEntriesTotal ?? 0;

export default artefactsSlice.reducer;
