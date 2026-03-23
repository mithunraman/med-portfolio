import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

export interface OnboardingState {
  isInitialized: boolean;
}

const initialState: OnboardingState = {
  isInitialized: false,
};

/**
 * Load onboarding state from storage on app launch.
 */
export const loadOnboardingState = createAsyncThunk('onboarding/load', async () => {
  return {};
});

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(loadOnboardingState.fulfilled, (state) => {
      state.isInitialized = true;
    });
  },
});

export default onboardingSlice.reducer;
