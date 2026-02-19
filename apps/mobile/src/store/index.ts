import { configureStore } from '@reduxjs/toolkit';
import {
  artefactsReducer,
  authReducer,
  conversationsReducer,
  messagesReducer,
  nudgeReducer,
  onboardingReducer,
} from './slices';

export const store = configureStore({
  reducer: {
    artefacts: artefactsReducer,
    auth: authReducer,
    conversations: conversationsReducer,
    messages: messagesReducer,
    onboarding: onboardingReducer,
    nudge: nudgeReducer,
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
