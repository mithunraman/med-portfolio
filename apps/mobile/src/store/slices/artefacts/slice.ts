import type { Artefact } from '@acme/shared';
import { createEntityAdapter, createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../../index';
import { createArtefact, fetchArtefacts } from './thunks';

const artefactsAdapter = createEntityAdapter<Artefact>({
  sortComparer: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
});

export interface ArtefactsState {
  creatingArtefact: boolean;
  loading: boolean;
  error: string | null;
  nextCursor: string | null;
}

const artefactsSlice = createSlice({
  name: 'artefacts',
  initialState: artefactsAdapter.getInitialState<ArtefactsState>({
    creatingArtefact: false,
    loading: false,
    error: null,
    nextCursor: null,
  }),
  reducers: {
    clearArtefactsError(state) {
      state.error = null;
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
      });
  },
});

export const { clearArtefactsError } = artefactsSlice.actions;

export const {
  selectAll: selectAllArtefacts,
  selectById: selectArtefactById,
  selectIds: selectArtefactIds,
} = artefactsAdapter.getSelectors((state: RootState) => state.artefacts);

export default artefactsSlice.reducer;
