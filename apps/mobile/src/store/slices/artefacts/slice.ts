import type { Artefact } from '@acme/shared';
import { ArtefactStatus } from '@acme/shared';
import {
  createEntityAdapter,
  createSelector,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { TypedError } from '../../../utils/classifyError';
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

import {
  type FilterView,
  viewKeyFromStatus,
  invalidateView,
  removeIdFromView,
} from '../../viewHelpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { FilterView };

export type EntityStatus = 'loading' | 'updating' | 'saving';

export interface ArtefactsState {
  creatingArtefact: boolean;
  statusById: Record<string, EntityStatus>;
  error: TypedError | null;
  stale: boolean;
  views: Record<string, FilterView>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const viewKey = (status?: ArtefactStatus | null): string =>
  viewKeyFromStatus(status);

/** Shared logic for mutations that change an artefact's status. */
function handleStatusChange(
  state: ArtefactsState & { entities: Record<string, Artefact | undefined> },
  id: string,
  newStatus: ArtefactStatus
): void {
  const oldStatus = state.entities[id]?.status;
  if (oldStatus !== undefined) {
    removeIdFromView(state, viewKey(oldStatus), id);
  }
  invalidateView(state, viewKey(newStatus));
  invalidateView(state, viewKey(null));
}

// ---------------------------------------------------------------------------
// Adapter & Slice
// ---------------------------------------------------------------------------

const artefactsAdapter = createEntityAdapter<Artefact>({
  sortComparer: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
});

const artefactsSlice = createSlice({
  name: 'artefacts',
  initialState: artefactsAdapter.getInitialState<ArtefactsState>({
    creatingArtefact: false,
    statusById: {},
    error: null,
    stale: false,
    views: {},
  }),
  reducers: {
    markArtefactsStale(state) {
      state.stale = true;
    },
    resetView(state, action: PayloadAction<string>) {
      invalidateView(state, action.payload);
    },
    resetAllViews(state) {
      state.views = {};
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
        invalidateView(state, viewKey(ArtefactStatus.IN_CONVERSATION));
        invalidateView(state, viewKey(null));
      })
      .addCase(createArtefact.rejected, (state, action) => {
        state.creatingArtefact = false;
        state.error = (action.payload as TypedError) ?? null;
      })

      // fetchArtefacts
      .addCase(fetchArtefacts.pending, (state, action) => {
        const key = viewKey(action.meta.arg?.status);
        const existing = state.views[key];
        if (action.meta.arg?.cursor && existing) {
          existing.status = 'loadingMore';
        } else {
          state.views[key] = {
            ids: existing?.ids ?? [],
            nextCursor: existing?.nextCursor ?? null,
            status: 'loading',
            lastFetchedAt: existing?.lastFetchedAt ?? null,
          };
        }
        state.error = null;
      })
      .addCase(fetchArtefacts.fulfilled, (state, action) => {
        const key = viewKey(action.meta.arg?.status);
        const resultIds = action.payload.artefacts.map((a) => a.id);

        if (!action.meta.arg?.cursor) {
          state.views[key] = {
            ids: resultIds,
            nextCursor: action.payload.nextCursor,
            status: 'idle',
            lastFetchedAt: action.payload.fetchedAt,
          };
        } else {
          const view = state.views[key];
          if (view) {
            view.ids.push(...resultIds);
            view.nextCursor = action.payload.nextCursor;
            view.status = 'idle';
            view.lastFetchedAt = action.payload.fetchedAt;
          }
        }

        state.stale = false;
        artefactsAdapter.upsertMany(state, action.payload.artefacts);
      })
      .addCase(fetchArtefacts.rejected, (state, action) => {
        if (!action.meta.condition) {
          const key = viewKey(action.meta.arg?.status);
          const view = state.views[key];
          if (view) view.status = 'idle';
          state.error = (action.payload as TypedError) ?? null;
        }
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
        handleStatusChange(state, action.payload.id, action.payload.status);
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
        handleStatusChange(state, action.payload.id, action.payload.status);
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
        invalidateView(state, viewKey(ArtefactStatus.IN_REVIEW));
        invalidateView(state, viewKey(null));
      })
      .addCase(duplicateToReview.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
      })

      // editArtefact — content changes only, no view impact
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
      // No view insertion — dashboard items are not a complete page for any filter.
      .addCase(fetchInit.fulfilled, (state, action) => {
        const items = action.payload.dashboard?.recentEntries.items;
        if (items?.length) {
          artefactsAdapter.upsertMany(state, items);
        }
      })

      // restoreVersion — content changes only, no view impact
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

      // deleteArtefact — remove from all views that contain it
      .addCase(deleteArtefact.pending, (state, action) => {
        state.statusById[action.meta.arg.artefactId] = 'updating';
      })
      .addCase(deleteArtefact.fulfilled, (state, action) => {
        const id = action.payload;
        const oldStatus = state.entities[id]?.status;
        delete state.statusById[id];
        artefactsAdapter.removeOne(state, id);
        if (oldStatus !== undefined) {
          removeIdFromView(state, viewKey(oldStatus), id);
        }
        removeIdFromView(state, viewKey(null), id);
      })
      .addCase(deleteArtefact.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.artefactId];
      })

      // Cross-slice: deleting a conversation cascades to its artefact server-side.
      // Guaranteed IN_CONVERSATION — entity scan to find the artefact by conversation ID.
      .addCase(deleteConversation.fulfilled, (state, action) => {
        const conversationId = action.payload;
        const artefact = Object.values(state.entities).find(
          (a) => a?.conversation?.id === conversationId
        );
        if (artefact) {
          removeIdFromView(state, viewKey(ArtefactStatus.IN_CONVERSATION), artefact.id);
          removeIdFromView(state, viewKey(null), artefact.id);
          artefactsAdapter.removeOne(state, artefact.id);
        }
      });
  },
});

export const { markArtefactsStale, resetView, resetAllViews } = artefactsSlice.actions;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const {
  selectAll: selectAllArtefacts,
  selectById: selectArtefactById,
  selectIds: selectArtefactIds,
} = artefactsAdapter.getSelectors((state: RootState) => state.artefacts);

export const selectFilterView = (state: RootState, key: string): FilterView | undefined =>
  state.artefacts.views[key];

export const selectArtefactsByView = createSelector(
  [
    (state: RootState, key: string) => state.artefacts.views[key],
    (state: RootState) => state.artefacts.entities,
  ],
  (view, entities) => {
    return view ? view.ids.map((id) => entities[id]).filter((a): a is Artefact => !!a) : [];
  }
);

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
