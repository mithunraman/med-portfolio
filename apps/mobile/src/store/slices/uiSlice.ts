import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

/**
 * Ephemeral, session-scoped UI state. Deliberately NOT persisted to storage and
 * reset on session end (see SESSION_END handling in store/index.ts) — dismissing a
 * banner should last the session, not forever.
 */
interface UIState {
  /**
   * Artefact ids whose advisory ("needs your input") banner the user has dismissed
   * this session. Sparse set: presence = dismissed, absence = not dismissed.
   */
  dismissedAdvisories: Record<string, true>;
}

const initialState: UIState = {
  dismissedAdvisories: {},
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    dismissAdvisory(state, action: PayloadAction<string>) {
      state.dismissedAdvisories[action.payload] = true;
    },
  },
});

export const { dismissAdvisory } = uiSlice.actions;

export const selectIsAdvisoryDismissed = (state: RootState, artefactId: string): boolean =>
  state.ui.dismissedAdvisories[artefactId] === true;

export default uiSlice.reducer;
