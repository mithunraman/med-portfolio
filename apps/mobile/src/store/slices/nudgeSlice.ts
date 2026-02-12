import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { AppStorage } from '../../services';
import { logger } from '../../utils/logger';

const nudgeLogger = logger.createScope('NudgeSlice');

/**
 * Configuration for nudge rate limiting.
 */
const NUDGE_CONFIG = {
  // Minimum time between nudges (24 hours)
  MIN_INTERVAL_MS: 24 * 60 * 60 * 1000,
  // Maximum nudges before stopping
  MAX_NUDGE_COUNT: 3,
  // Actions required before first nudge
  ACTIONS_BEFORE_FIRST_NUDGE: 1,
} as const;

export interface NudgeState {
  lastNudgeTimestamp: number | null;
  nudgeCount: number;
  meaningfulActionsCount: number;
  dismissedBanners: string[];
  shouldShowNudge: boolean;
  isInitialized: boolean;
}

const initialState: NudgeState = {
  lastNudgeTimestamp: null,
  nudgeCount: 0,
  meaningfulActionsCount: 0,
  dismissedBanners: [],
  shouldShowNudge: false,
  isInitialized: false,
};

/**
 * Load nudge state from storage.
 */
export const loadNudgeState = createAsyncThunk('nudge/load', async () => {
  nudgeLogger.debug('Loading nudge state');

  const stored = await AppStorage.get('nudge');

  return {
    lastNudgeTimestamp: stored?.lastNudgeTimestamp ?? null,
    nudgeCount: stored?.nudgeCount ?? 0,
    meaningfulActionsCount: stored?.meaningfulActionsCount ?? 0,
    dismissedBanners: stored?.dismissedBanners ?? [],
  };
});

/**
 * Record a meaningful action (triggers nudge evaluation).
 */
export const recordMeaningfulAction = createAsyncThunk(
  'nudge/recordAction',
  async (_, { getState }) => {
    const state = getState() as { nudge: NudgeState };
    const newCount = state.nudge.meaningfulActionsCount + 1;

    const stored = await AppStorage.get('nudge');
    await AppStorage.set('nudge', {
      lastNudgeTimestamp: stored?.lastNudgeTimestamp ?? null,
      nudgeCount: stored?.nudgeCount ?? 0,
      meaningfulActionsCount: newCount,
      dismissedBanners: stored?.dismissedBanners ?? [],
    });

    nudgeLogger.debug('Meaningful action recorded', { count: newCount });
    return newCount;
  }
);

/**
 * Mark nudge as shown (updates rate limiting).
 */
export const markNudgeShown = createAsyncThunk('nudge/markShown', async (_, { getState }) => {
  const state = getState() as { nudge: NudgeState };
  const now = Date.now();
  const newCount = state.nudge.nudgeCount + 1;

  const stored = await AppStorage.get('nudge');
  await AppStorage.set('nudge', {
    lastNudgeTimestamp: now,
    nudgeCount: newCount,
    meaningfulActionsCount: stored?.meaningfulActionsCount ?? 0,
    dismissedBanners: stored?.dismissedBanners ?? [],
  });

  nudgeLogger.info('Nudge shown', { count: newCount });
  return { timestamp: now, count: newCount };
});

/**
 * Dismiss a specific banner.
 */
export const dismissBanner = createAsyncThunk(
  'nudge/dismissBanner',
  async (bannerId: string, { getState }) => {
    const state = getState() as { nudge: NudgeState };
    const newDismissed = [...state.nudge.dismissedBanners, bannerId];

    const stored = await AppStorage.get('nudge');
    await AppStorage.set('nudge', {
      lastNudgeTimestamp: stored?.lastNudgeTimestamp ?? null,
      nudgeCount: stored?.nudgeCount ?? 0,
      meaningfulActionsCount: stored?.meaningfulActionsCount ?? 0,
      dismissedBanners: newDismissed,
    });

    nudgeLogger.debug('Banner dismissed', { bannerId });
    return bannerId;
  }
);

/**
 * Check if nudge should be shown based on rate limiting.
 */
function evaluateShouldShowNudge(state: NudgeState): boolean {
  // Not enough actions yet
  if (state.meaningfulActionsCount < NUDGE_CONFIG.ACTIONS_BEFORE_FIRST_NUDGE) {
    return false;
  }

  // Max nudges reached
  if (state.nudgeCount >= NUDGE_CONFIG.MAX_NUDGE_COUNT) {
    return false;
  }

  // Rate limit check
  if (state.lastNudgeTimestamp) {
    const elapsed = Date.now() - state.lastNudgeTimestamp;
    if (elapsed < NUDGE_CONFIG.MIN_INTERVAL_MS) {
      return false;
    }
  }

  return true;
}

const nudgeSlice = createSlice({
  name: 'nudge',
  initialState,
  reducers: {
    hideNudge(state) {
      state.shouldShowNudge = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadNudgeState.fulfilled, (state, action) => {
        state.lastNudgeTimestamp = action.payload.lastNudgeTimestamp;
        state.nudgeCount = action.payload.nudgeCount;
        state.meaningfulActionsCount = action.payload.meaningfulActionsCount;
        state.dismissedBanners = action.payload.dismissedBanners;
        state.isInitialized = true;
        state.shouldShowNudge = evaluateShouldShowNudge(state);
      })
      .addCase(recordMeaningfulAction.fulfilled, (state, action) => {
        state.meaningfulActionsCount = action.payload;
        state.shouldShowNudge = evaluateShouldShowNudge(state);
      })
      .addCase(markNudgeShown.fulfilled, (state, action) => {
        state.lastNudgeTimestamp = action.payload.timestamp;
        state.nudgeCount = action.payload.count;
        state.shouldShowNudge = false;
      })
      .addCase(dismissBanner.fulfilled, (state, action) => {
        state.dismissedBanners.push(action.payload);
      });
  },
});

export const { hideNudge } = nudgeSlice.actions;
export default nudgeSlice.reducer;
