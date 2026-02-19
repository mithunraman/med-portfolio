import { createSlice } from '@reduxjs/toolkit';
import { createArtefact } from './thunks';

export interface ArtefactsState {
  creatingArtefact: boolean;
  error: string | null;
}

const initialState: ArtefactsState = {
  creatingArtefact: false,
  error: null,
};

const artefactsSlice = createSlice({
  name: 'artefacts',
  initialState,
  reducers: {
    clearArtefactsError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createArtefact.pending, (state) => {
        state.creatingArtefact = true;
        state.error = null;
      })
      .addCase(createArtefact.fulfilled, (state) => {
        state.creatingArtefact = false;
      })
      .addCase(createArtefact.rejected, (state, action) => {
        state.creatingArtefact = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearArtefactsError } = artefactsSlice.actions;
export default artefactsSlice.reducer;
