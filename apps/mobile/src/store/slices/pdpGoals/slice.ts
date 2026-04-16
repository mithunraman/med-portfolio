import type { PdpGoalListItem, PdpGoalResponse, PdpGoalStatus } from '@acme/shared';
import {
  createEntityAdapter,
  createSelector,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { TypedError } from '../../../utils/classifyError';
import {
  type FilterView,
  viewKeyFromStatus,
  invalidateView,
  removeIdFromView,
} from '../../viewHelpers';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PdpGoalFilterView = FilterView;

/** List endpoint returns PdpGoalListItem; detail endpoint returns PdpGoalResponse (adds artefact fields). */
export type PdpGoalEntity = PdpGoalListItem & Partial<Pick<PdpGoalResponse, 'artefactId' | 'artefactTitle'>>;

export type PdpGoalEntityStatus = 'loading' | 'updating';

export interface PdpGoalsState {
  statusById: Record<string, PdpGoalEntityStatus>;
  error: TypedError | null;
  stale: boolean;
  views: Record<string, FilterView>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const pdpGoalViewKey = (status?: PdpGoalStatus | null): string =>
  viewKeyFromStatus(status);

// ---------------------------------------------------------------------------
// Adapter & Slice
// ---------------------------------------------------------------------------

const pdpGoalsAdapter = createEntityAdapter<PdpGoalEntity>();

const pdpGoalsSlice = createSlice({
  name: 'pdpGoals',
  initialState: pdpGoalsAdapter.getInitialState<PdpGoalsState>({
    statusById: {},
    error: null,
    stale: false,
    views: {},
  }),
  reducers: {
    markPdpGoalsStale(state) {
      state.stale = true;
    },
    resetPdpGoalView(state, action: PayloadAction<string>) {
      invalidateView(state, action.payload);
    },
    resetAllPdpGoalViews(state) {
      state.views = {};
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchPdpGoals
      .addCase(fetchPdpGoals.pending, (state, action) => {
        const key = pdpGoalViewKey(action.meta.arg?.status);
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
      .addCase(fetchPdpGoals.fulfilled, (state, action) => {
        const key = pdpGoalViewKey(action.meta.arg?.status);
        const resultIds = action.payload.goals.map((g) => g.id);

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
        pdpGoalsAdapter.upsertMany(state, action.payload.goals);
      })
      .addCase(fetchPdpGoals.rejected, (state, action) => {
        if (!action.meta.condition) {
          const key = pdpGoalViewKey(action.meta.arg?.status);
          const view = state.views[key];
          if (view) view.status = 'idle';
          state.error = (action.payload as TypedError) ?? null;
        }
      })

      // fetchPdpGoal
      .addCase(fetchPdpGoal.pending, (state, action) => {
        state.statusById[action.meta.arg.goalId] = 'loading';
      })
      .addCase(fetchPdpGoal.fulfilled, (state, action) => {
        delete state.statusById[action.meta.arg.goalId];
        pdpGoalsAdapter.upsertOne(state, action.payload);
      })
      .addCase(fetchPdpGoal.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.goalId];
      })

      // updatePdpGoal
      .addCase(updatePdpGoal.pending, (state, action) => {
        state.statusById[action.meta.arg.goalId] = 'updating';
      })
      .addCase(updatePdpGoal.fulfilled, (state, action) => {
        const goalId = action.meta.arg.goalId;
        delete state.statusById[goalId];

        // If status changed, remove from old view and invalidate new + all views
        const oldStatus = state.entities[goalId]?.status;
        const newStatus = action.payload.status;
        if (oldStatus !== undefined && oldStatus !== newStatus) {
          removeIdFromView(state, pdpGoalViewKey(oldStatus), goalId);
          invalidateView(state, pdpGoalViewKey(newStatus));
          invalidateView(state, pdpGoalViewKey(null));
        }

        pdpGoalsAdapter.upsertOne(state, action.payload);
      })
      .addCase(updatePdpGoal.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.goalId];
      })

      // addPdpGoalAction
      .addCase(addPdpGoalAction.pending, (state, action) => {
        state.statusById[action.meta.arg.goalId] = 'updating';
      })
      .addCase(addPdpGoalAction.fulfilled, (state, action) => {
        delete state.statusById[action.meta.arg.goalId];
        pdpGoalsAdapter.upsertOne(state, action.payload);
      })
      .addCase(addPdpGoalAction.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.goalId];
      })

      // Cross-slice hydration: populate entity store from dashboard init response.
      .addCase(fetchInit.fulfilled, (state, action) => {
        const items = action.payload.dashboard?.pdpGoalsDue.items;
        if (items?.length) {
          pdpGoalsAdapter.upsertMany(state, items);
        }
      })

      // updatePdpGoalAction
      .addCase(updatePdpGoalAction.pending, (state, action) => {
        state.statusById[action.meta.arg.goalId] = 'updating';
      })
      .addCase(updatePdpGoalAction.fulfilled, (state, action) => {
        delete state.statusById[action.meta.arg.goalId];
        pdpGoalsAdapter.upsertOne(state, action.payload);
      })
      .addCase(updatePdpGoalAction.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.goalId];
      })

      // deletePdpGoal — remove from all views that contain it
      .addCase(deletePdpGoal.pending, (state, action) => {
        state.statusById[action.meta.arg.goalId] = 'updating';
      })
      .addCase(deletePdpGoal.fulfilled, (state, action) => {
        const id = action.payload;
        const oldStatus = state.entities[id]?.status;
        delete state.statusById[id];
        pdpGoalsAdapter.removeOne(state, id);
        if (oldStatus !== undefined) {
          removeIdFromView(state, pdpGoalViewKey(oldStatus), id);
        }
        removeIdFromView(state, pdpGoalViewKey(null), id);
      })
      .addCase(deletePdpGoal.rejected, (state, action) => {
        delete state.statusById[action.meta.arg.goalId];
      })

      // Cross-slice: finalising an artefact creates/archives PDP goals server-side.
      .addCase(finaliseArtefact.fulfilled, (state) => {
        state.stale = true;
        state.views = {};
      })

      // Cross-slice: deleting an artefact cascades to its PDP goals server-side.
      .addCase(deleteArtefact.fulfilled, (state) => {
        state.stale = true;
        state.views = {};
      })

      // Cross-slice: deleting a conversation cascades to artefact + PDP goals.
      .addCase(deleteConversation.fulfilled, (state) => {
        state.stale = true;
        state.views = {};
      });
  },
});

export const { markPdpGoalsStale, resetPdpGoalView, resetAllPdpGoalViews } =
  pdpGoalsSlice.actions;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const {
  selectAll: selectAllPdpGoals,
  selectById: selectPdpGoalById,
} = pdpGoalsAdapter.getSelectors((state: RootState) => state.pdpGoals);

export const selectPdpGoalFilterView = (
  state: RootState,
  key: string
): PdpGoalFilterView | undefined => state.pdpGoals.views[key];

// Per-key memoized selectors — one per filter tab to avoid cache thrashing.
type ViewSelector = (state: RootState) => PdpGoalEntity[];
const _viewSelectorCache: Record<string, ViewSelector> = {};
export const selectPdpGoalsByView = (state: RootState, key: string): PdpGoalEntity[] => {
  let selector = _viewSelectorCache[key];
  if (!selector) {
    selector = createSelector(
      [
        (s: RootState) => s.pdpGoals.views[key],
        (s: RootState) => s.pdpGoals.entities,
      ],
      (view, entities) =>
        view ? view.ids.map((id) => entities[id]).filter((g): g is PdpGoalEntity => !!g) : []
    );
    _viewSelectorCache[key] = selector;
  }
  return selector(state);
};

/** Joins dashboard PDP goal IDs with the normalized entity store. */
export const selectPdpGoalsDueSoon = createSelector(
  [
    (state: RootState) => state.dashboard.pdpGoalsDueIds,
    (state: RootState) => state.pdpGoals.entities,
  ],
  (ids, entities) =>
    (ids ?? []).map((id) => entities[id]).filter((g): g is PdpGoalEntity => !!g)
);

export const selectPdpGoalsDueTotal = (state: RootState) =>
  state.dashboard.pdpGoalsDueTotal ?? 0;

export default pdpGoalsSlice.reducer;
