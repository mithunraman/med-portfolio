import type { AppNotice, InitAcknowledgement, UpdatePolicy } from '@acme/shared';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { fetchInit } from '../dashboard/thunks';

// Shape-aware comparators below mirror the `shallowEqualUser` / `assignUserIfChanged`
// pattern in authSlice. Without these, every /init produces fresh object/array
// references for these fields — defeating Object.is equality in `useSelector`
// and the input-reference memoization in `createSelector` (notably for
// selectBannerNotice / selectModalNotice).

function shallowEqualUpdatePolicy(
  a: UpdatePolicy | null,
  b: UpdatePolicy | null
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return a.status === b.status && a.latestVersion === b.latestVersion;
}

function shallowEqualAcknowledgement(
  a: InitAcknowledgement | null,
  b: InitAcknowledgement | null
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.needs !== b.needs) return false;
  if (a.needs && b.needs) return a.document.version === b.document.version;
  return true;
}

function sameNoticeIds(a: AppNotice[], b: AppNotice[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

// Holds init-response-derived UI state that no other slice owns: in-app
// notices, OTA update policy, and the signup-gate acknowledgement. Not a
// strict "notices-only" slice.
export interface NoticesState {
  notices: AppNotice[];
  updatePolicy: UpdatePolicy | null;
  dismissedUpdateVersion: string | null;
  dismissedUpdateHydrated: boolean;
  acknowledgement: InitAcknowledgement | null;
}

const initialState: NoticesState = {
  notices: [],
  updatePolicy: null,
  dismissedUpdateVersion: null,
  dismissedUpdateHydrated: false,
  acknowledgement: null,
};

const noticesSlice = createSlice({
  name: 'notices',
  initialState,
  reducers: {
    removeNotice(state, action: PayloadAction<string>) {
      state.notices = state.notices.filter((n) => n.id !== action.payload);
    },
    setDismissedUpdateVersion(state, action: PayloadAction<string | null>) {
      state.dismissedUpdateVersion = action.payload;
      state.dismissedUpdateHydrated = true;
    },
    dismissUpdateVersion(state, action: PayloadAction<string>) {
      state.dismissedUpdateVersion = action.payload;
    },
    acknowledgementSatisfied(state) {
      if (state.acknowledgement?.needs !== false) {
        state.acknowledgement = { needs: false };
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchInit.fulfilled, (state, action) => {
      if (!sameNoticeIds(state.notices, action.payload.notices)) {
        state.notices = action.payload.notices;
      }
      if (!shallowEqualUpdatePolicy(state.updatePolicy, action.payload.updatePolicy)) {
        state.updatePolicy = action.payload.updatePolicy;
      }
      if (!shallowEqualAcknowledgement(state.acknowledgement, action.payload.acknowledgement)) {
        state.acknowledgement = action.payload.acknowledgement;
      }
    });
  },
});

export const {
  removeNotice,
  setDismissedUpdateVersion,
  dismissUpdateVersion,
  acknowledgementSatisfied,
} = noticesSlice.actions;
export default noticesSlice.reducer;
