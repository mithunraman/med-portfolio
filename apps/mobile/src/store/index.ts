import type { Action, Reducer } from '@reduxjs/toolkit';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import {
  artefactsReducer,
  authReducer,
  conversationsReducer,
  dashboardReducer,
  messagesReducer,
  networkReducer,
  noticesReducer,
  onboardingReducer,
  pdpGoalsReducer,
  reviewPeriodsReducer,
} from './slices';

const appReducer = combineReducers({
  artefacts: artefactsReducer,
  auth: authReducer,
  conversations: conversationsReducer,
  messages: messagesReducer,
  network: networkReducer,
  notices: noticesReducer,
  onboarding: onboardingReducer,
  dashboard: dashboardReducer,
  pdpGoals: pdpGoalsReducer,
  reviewPeriods: reviewPeriodsReducer,
});

/**
 * Root reducer that resets user-specific state on logout.
 * Preserves app-level state (onboarding, network) that is initialized once on mount.
 * Auth slice handles its own reset (status: 'unauthenticated') via logout.fulfilled.
 */
const rootReducer: Reducer<ReturnType<typeof appReducer>, Action> = (state, action) => {
  if (action.type === 'auth/logout/fulfilled') {
    return appReducer(
      state
        ? {
            // Preserve app-level state
            onboarding: state.onboarding,
            network: state.network,
            // Reset user-specific slices by passing undefined
            artefacts: undefined as never,
            auth: undefined as never,
            conversations: undefined as never,
            messages: undefined as never,
            dashboard: undefined as never,
            notices: undefined as never,
            pdpGoals: undefined as never,
            reviewPeriods: undefined as never,
          }
        : undefined,
      action,
    );
  }
  return appReducer(state, action);
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these paths in serializable check (for async thunks)
        ignoredActions: ['auth/initialize/fulfilled', 'auth/login/fulfilled'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Re-export slices and actions
export * from './slices';
