import { configureStore } from '@reduxjs/toolkit';
import {
  artefactsReducer,
  authReducer,
  conversationsReducer,
  dashboardReducer,
  messagesReducer,
  networkReducer,
  onboardingReducer,
  pdpGoalsReducer,
  reviewPeriodsReducer,
} from './slices';

export const store = configureStore({
  reducer: {
    artefacts: artefactsReducer,
    auth: authReducer,
    conversations: conversationsReducer,
    messages: messagesReducer,
    network: networkReducer,
    onboarding: onboardingReducer,
    dashboard: dashboardReducer,
    pdpGoals: pdpGoalsReducer,
    reviewPeriods: reviewPeriodsReducer,
  },
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
