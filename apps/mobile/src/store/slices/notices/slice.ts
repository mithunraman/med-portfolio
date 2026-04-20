import type { AppNotice, UpdatePolicy } from '@acme/shared';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { fetchInit } from '../dashboard/thunks';

export interface NoticesState {
  notices: AppNotice[];
  updatePolicy: UpdatePolicy | null;
}

const initialState: NoticesState = {
  notices: [],
  updatePolicy: null,
};

const noticesSlice = createSlice({
  name: 'notices',
  initialState,
  reducers: {
    removeNotice(state, action: PayloadAction<string>) {
      state.notices = state.notices.filter((n) => n.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchInit.fulfilled, (state, action) => {
      state.notices = action.payload.notices;
      state.updatePolicy = action.payload.updatePolicy;
    });
  },
});

export const { removeNotice } = noticesSlice.actions;
export default noticesSlice.reducer;
