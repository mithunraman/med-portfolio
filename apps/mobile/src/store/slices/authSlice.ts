import type { AuthUser, QuotaStatus, SpecialtyOption, UpdateProfileRequest } from '@acme/shared';
import { UserRole } from '@acme/shared';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as Sentry from '@sentry/react-native';
import { api, mobileTokenProvider } from '../../api/client';
import { AppSecureStorage, SECURE_STORAGE_KEYS } from '../../services';
import { logger } from '../../utils/logger';
import { fetchInit } from './dashboard/thunks';

const authLogger = logger.createScope('AuthSlice');

/**
 * Cheap shallow equality for AuthUser — hot-path reducers avoid churning the
 * reference when the object is materially unchanged, which prevents cascade
 * re-renders in `useSelector(state => state.auth.user)`.
 */
function shallowEqualUser(a: AuthUser | null, b: AuthUser | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.name === b.name &&
    a.role === b.role &&
    a.specialty?.code === b.specialty?.code &&
    a.specialty?.trainingStage?.code === b.specialty?.trainingStage?.code &&
    a.deletionRequestedAt === b.deletionRequestedAt &&
    a.deletionScheduledFor === b.deletionScheduledFor
  );
}

function assignUserIfChanged(state: { user: AuthUser | null }, next: AuthUser): void {
  if (!shallowEqualUser(state.user, next)) {
    state.user = next;
  }
}

/**
 * Update the stored `user` field while preserving other StoredUserSession fields.
 * No-op if there's no existing session in SecureStore.
 */
async function updateStoredUser(user: AuthUser): Promise<void> {
  const storedSession = await AppSecureStorage.get(SECURE_STORAGE_KEYS.USER);
  if (storedSession) {
    await AppSecureStorage.set(SECURE_STORAGE_KEYS.USER, { ...storedSession, user });
  }
}

/**
 * Persist auth session to secure storage after successful login/registration.
 */
async function persistAuthSession(
  response: { accessToken: string; refreshToken: string; user: AuthUser }
): Promise<void> {
  await mobileTokenProvider.setTokens({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  });
  await AppSecureStorage.set(SECURE_STORAGE_KEYS.USER, {
    user: response.user,
    lastLoginAt: Date.now(),
  });
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'guest' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  quota: QuotaStatus | null;
  error: string | null;
  isNewUser: boolean | null;
  specialties: SpecialtyOption[];
}

const initialState: AuthState = {
  status: 'idle',
  user: null,
  quota: null,
  error: null,
  isNewUser: null,
  specialties: [],
};

/**
 * Initialize auth state on app launch.
 * Restores session from local secure storage — no network call.
 * Token validity is verified on the first API request (e.g. dashboard fetch);
 * if the token was revoked, the global onUnauthorized handler redirects to login.
 */
export const initializeAuth = createAsyncThunk('auth/initialize', async () => {
  authLogger.debug('Initializing auth');

  const [accessToken, refreshToken] = await Promise.all([
    mobileTokenProvider.getAccessToken(),
    mobileTokenProvider.getRefreshToken(),
  ]);
  if (!accessToken || !refreshToken) {
    authLogger.debug('No existing tokens');
    await AppSecureStorage.clearSession();
    return { status: 'unauthenticated' as const, user: null };
  }

  const storedSession = await AppSecureStorage.get(SECURE_STORAGE_KEYS.USER);
  if (!storedSession?.user) {
    authLogger.warn('Tokens exist but no stored user, clearing session');
    await AppSecureStorage.clearSession();
    return { status: 'unauthenticated' as const, user: null };
  }

  const isGuest = storedSession.user.role === UserRole.USER_GUEST;
  authLogger.info('Session restored', { userId: storedSession.user.id, isGuest });

  return {
    status: (isGuest ? 'guest' : 'authenticated') as AuthStatus,
    user: storedSession.user,
  };
});

/**
 * Send OTP to email address.
 */
export const otpSend = createAsyncThunk(
  'auth/otpSend',
  async (email: string, { rejectWithValue }) => {
    authLogger.info('Sending OTP', { email });

    try {
      const response = await api.auth.otpSend({ email });
      return { email, isNewUser: response.isNewUser };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send OTP';
      authLogger.error('OTP send failed', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Verify OTP and authenticate.
 */
export const otpVerify = createAsyncThunk(
  'auth/otpVerify',
  async (
    { email, code, name }: { email: string; code: string; name?: string },
    { rejectWithValue }
  ) => {
    authLogger.info('Verifying OTP', { email });

    try {
      const response = await api.auth.otpVerify({ email, code, name });
      await persistAuthSession(response);

      authLogger.info('OTP verification successful', { userId: response.user.id });
      return response.user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid OTP';
      authLogger.error('OTP verification failed', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Register as guest (Try the app).
 */
export const registerGuest = createAsyncThunk(
  'auth/registerGuest',
  async (_, { rejectWithValue }) => {
    authLogger.info('Guest registration attempt');

    try {
      const response = await api.auth.registerGuest();
      await persistAuthSession(response);

      authLogger.info('Guest registration successful', { userId: response.user.id });
      return response.user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Guest registration failed';
      authLogger.error('Guest registration failed', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Claim guest account by verifying email via OTP.
 * Upgrades the current guest user to a full account in place.
 */
export const claimGuest = createAsyncThunk(
  'auth/claimGuest',
  async (
    { email, code, name }: { email: string; code: string; name: string },
    { rejectWithValue }
  ) => {
    authLogger.info('Claiming guest account', { email });

    try {
      const response = await api.auth.claimGuest({ email, code, name });
      await persistAuthSession(response);

      authLogger.info('Guest account claimed', { userId: response.user.id });
      return response.user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to claim account';
      authLogger.error('Guest claim failed', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Fetch available specialties and training stages from the backend.
 * Public endpoint — no auth required.
 */
export const fetchSpecialties = createAsyncThunk(
  'auth/fetchSpecialties',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.specialties.getSpecialties();
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load specialties';
      return rejectWithValue(message);
    }
  },
  {
    condition: (_, { getState }) => {
      const { auth } = getState() as { auth: AuthState };
      return auth.specialties.length === 0;
    },
  }
);

/**
 * Update user's specialty and training stage.
 * Persists to backend and updates local state.
 */
export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (data: UpdateProfileRequest, { rejectWithValue }) => {
    authLogger.info('Updating profile', { specialty: data.specialty, stage: data.trainingStage });

    try {
      const user = await api.auth.updateProfile(data);
      await updateStoredUser(user);

      authLogger.info('Profile updated', { userId: user.id });
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      authLogger.error('Profile update failed', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Request account deletion (48h grace period).
 */
export const requestDeletion = createAsyncThunk(
  'auth/requestDeletion',
  async (_, { rejectWithValue }) => {
    authLogger.info('Requesting account deletion');

    try {
      const user = await api.auth.requestDeletion();
      await updateStoredUser(user);

      authLogger.info('Account deletion requested', {
        scheduledFor: user.deletionScheduledFor,
      });
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to request deletion';
      authLogger.error('Account deletion request failed', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Cancel a pending account deletion.
 */
export const cancelDeletion = createAsyncThunk(
  'auth/cancelDeletion',
  async (_, { rejectWithValue }) => {
    authLogger.info('Cancelling account deletion');

    try {
      const user = await api.auth.cancelDeletion();
      await updateStoredUser(user);

      authLogger.info('Account deletion cancelled');
      return user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel deletion';
      authLogger.error('Cancel deletion failed', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Logout and clear session.
 */
export const logout = createAsyncThunk('auth/logout', async () => {
  authLogger.info('Logout initiated');

  try {
    await api.auth.logout();
  } catch {
    // Ignore logout API errors
  }

  await AppSecureStorage.clearSession();
  authLogger.info('Logout completed');
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    setUnauthenticated(state) {
      state.status = 'unauthenticated';
      state.user = null;
    },
    updateQuota(state, action: { payload: QuotaStatus }) {
      state.quota = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Initialize
      .addCase(initializeAuth.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.status = action.payload.status;
        state.user = action.payload.user;
        state.error = null;
        if (action.payload.user) {
          Sentry.setUser({ id: action.payload.user.id });
        }
      })
      .addCase(initializeAuth.rejected, (state) => {
        state.status = 'unauthenticated';
        state.user = null;
      })

      // OTP Send
      .addCase(otpSend.pending, (state) => {
        state.error = null;
      })
      .addCase(otpSend.fulfilled, (state, action) => {
        state.isNewUser = action.payload.isNewUser;
      })
      .addCase(otpSend.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // OTP Verify
      .addCase(otpVerify.pending, (state) => {
        state.error = null;
      })
      .addCase(otpVerify.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload;
        state.error = null;
        Sentry.setUser({ id: action.payload.id });
      })
      .addCase(otpVerify.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Register Guest
      .addCase(registerGuest.pending, (state) => {
        state.error = null;
      })
      .addCase(registerGuest.fulfilled, (state, action) => {
        state.status = 'guest';
        state.user = action.payload;
        state.error = null;
        Sentry.setUser({ id: action.payload.id });
      })
      .addCase(registerGuest.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Claim Guest
      .addCase(claimGuest.pending, (state) => {
        state.error = null;
      })
      .addCase(claimGuest.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload;
        state.error = null;
        Sentry.setUser({ id: action.payload.id });
      })
      .addCase(claimGuest.rejected, (state, action) => {
        state.status = 'guest';
        state.error = action.payload as string;
      })

      // Logout
      .addCase(logout.fulfilled, () => {
        Sentry.setUser(null);
        return { ...initialState, status: 'unauthenticated' as const };
      })

      // Fetch Specialties
      .addCase(fetchSpecialties.fulfilled, (state, action) => {
        state.specialties = action.payload.specialties;
      })

      // Update Profile
      .addCase(updateProfile.fulfilled, (state, action) => {
        assignUserIfChanged(state, action.payload);
      })

      // Sync user profile + quota from init endpoint
      .addCase(fetchInit.fulfilled, (state, action) => {
        assignUserIfChanged(state, action.payload.user);
        state.quota = action.payload.quota;
      })

      // Request Deletion
      .addCase(requestDeletion.fulfilled, (state, action) => {
        assignUserIfChanged(state, action.payload);
      })

      // Cancel Deletion
      .addCase(cancelDeletion.fulfilled, (state, action) => {
        assignUserIfChanged(state, action.payload);
      });
  },
});

export const { clearError, setUnauthenticated, updateQuota } = authSlice.actions;
export default authSlice.reducer;
