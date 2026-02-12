import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { AppStorage, type AccountHint } from '../../services';
import { logger } from '../../utils/logger';

const onboardingLogger = logger.createScope('OnboardingSlice');

export interface OnboardingState {
  lastVisitedScreen: string | null;
  accountHint: AccountHint | null;
  isInitialized: boolean;
}

const initialState: OnboardingState = {
  lastVisitedScreen: null,
  accountHint: null,
  isInitialized: false,
};

/**
 * Load onboarding state from storage on app launch.
 */
export const loadOnboardingState = createAsyncThunk('onboarding/load', async () => {
  onboardingLogger.debug('Loading onboarding state');

  const accountHint = await AppStorage.get('accountHint');

  onboardingLogger.debug('Onboarding state loaded', {
    hasAccountHint: !!accountHint,
  });

  return { accountHint };
});

/**
 * Clear account hint (user explicitly doesn't want restore offer).
 */
export const dismissAccountHint = createAsyncThunk('onboarding/dismissAccountHint', async () => {
  onboardingLogger.info('Account hint dismissed');
  await AppStorage.remove('accountHint');
  return true;
});

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadOnboardingState.fulfilled, (state, action) => {
        state.accountHint = action.payload.accountHint;
        state.isInitialized = true;
      })
      .addCase(dismissAccountHint.fulfilled, (state) => {
        state.accountHint = null;
      });
  },
});

export default onboardingSlice.reducer;
