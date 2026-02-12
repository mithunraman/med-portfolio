import type { AuthUser, LoginRequest, RegisterRequest } from '@acme/shared';
import { UserRole } from '@acme/shared';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../../api/client';
import { AppSecureStorage, AppStorage } from '../../services';
import { logger } from '../../utils/logger';

const authLogger = logger.createScope('AuthSlice');

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'guest' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
}

const initialState: AuthState = {
  status: 'idle',
  user: null,
  error: null,
};

/**
 * Initialize auth state on app launch.
 * Checks for existing session and restores if valid.
 */
export const initializeAuth = createAsyncThunk('auth/initialize', async () => {
  authLogger.debug('Initializing auth');

  // Check for existing token
  const token = await AppSecureStorage.get('accessToken');
  if (!token) {
    authLogger.debug('No existing token');
    return { status: 'unauthenticated' as const, user: null };
  }

  // Try to restore session
  try {
    const currentUser = await api.auth.me();
    const storedSession = await AppSecureStorage.get('user');
    const isGuest = storedSession?.isGuest ?? currentUser.role === UserRole.USER_GUEST;

    authLogger.info('Session restored', { userId: currentUser.id, isGuest });

    return {
      status: (isGuest ? 'guest' : 'authenticated') as AuthStatus,
      user: currentUser,
    };
  } catch (error) {
    authLogger.warn('Session invalid, clearing');
    await AppSecureStorage.clearSession();
    return { status: 'unauthenticated' as const, user: null };
  }
});

/**
 * Login with email/password.
 */
export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginRequest, { rejectWithValue }) => {
    authLogger.info('Login attempt', { email: credentials.email });

    try {
      const response = await api.auth.login(credentials);

      // Store token and session
      await AppSecureStorage.set('accessToken', response.accessToken);
      await AppSecureStorage.set('user', {
        user: response.user,
        email: credentials.email,
        password: credentials.password,
        isGuest: false,
        lastLoginAt: Date.now(),
      });

      // Save account hint for reinstall detection
      await AppStorage.set('accountHint', {
        email: credentials.email,
        userId: response.user.id,
        lastLoginAt: Date.now(),
      });

      authLogger.info('Login successful', { userId: response.user.id });
      return response.user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      authLogger.error('Login failed', { error: message });
      return rejectWithValue(message);
    }
  }
);

/**
 * Register new account.
 */
export const register = createAsyncThunk(
  'auth/register',
  async (data: RegisterRequest & { password: string }, { rejectWithValue }) => {
    authLogger.info('Registration attempt', { email: data.email });

    try {
      const response = await api.auth.register(data);

      await AppSecureStorage.set('accessToken', response.accessToken);
      await AppSecureStorage.set('user', {
        user: response.user,
        email: data.email,
        password: data.password,
        isGuest: false,
        lastLoginAt: Date.now(),
      });

      await AppStorage.set('accountHint', {
        email: data.email,
        userId: response.user.id,
        lastLoginAt: Date.now(),
      });

      authLogger.info('Registration successful', { userId: response.user.id });
      return response.user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      authLogger.error('Registration failed', { error: message });
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

      await AppSecureStorage.set('accessToken', response.accessToken);
      await AppSecureStorage.set('user', {
        user: response.user,
        email: response.user.email,
        password: response.password ?? '',
        isGuest: true,
        lastLoginAt: Date.now(),
      });

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

/**
 * Re-authenticate using stored credentials (when token expires).
 */
export const reAuthenticate = createAsyncThunk(
  'auth/reAuthenticate',
  async (_, { rejectWithValue }) => {
    authLogger.info('Re-authentication attempt');

    const storedSession = await AppSecureStorage.get('user');
    if (!storedSession) {
      return rejectWithValue('No stored session');
    }

    try {
      const response = await api.auth.login({
        email: storedSession.email,
        password: storedSession.password,
      });

      await AppSecureStorage.set('accessToken', response.accessToken);
      await AppSecureStorage.set('user', {
        ...storedSession,
        user: response.user,
        lastLoginAt: Date.now(),
      });

      authLogger.info('Re-authentication successful');
      return response.user;
    } catch (error) {
      authLogger.error('Re-authentication failed');
      await AppSecureStorage.clearSession();
      return rejectWithValue('Re-authentication failed');
    }
  }
);

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
      })
      .addCase(initializeAuth.rejected, (state) => {
        state.status = 'unauthenticated';
        state.user = null;
      })

      // Login
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'unauthenticated';
        state.error = action.payload as string;
      })

      // Register
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload;
        state.error = null;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'unauthenticated';
        state.error = action.payload as string;
      })

      // Register Guest
      .addCase(registerGuest.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(registerGuest.fulfilled, (state, action) => {
        state.status = 'guest';
        state.user = action.payload;
        state.error = null;
      })
      .addCase(registerGuest.rejected, (state, action) => {
        state.status = 'unauthenticated';
        state.error = action.payload as string;
      })

      // Logout
      .addCase(logout.fulfilled, (state) => {
        state.status = 'unauthenticated';
        state.user = null;
        state.error = null;
      })

      // Re-authenticate
      .addCase(reAuthenticate.fulfilled, (state, action) => {
        state.user = action.payload;
        state.error = null;
      })
      .addCase(reAuthenticate.rejected, (state) => {
        state.status = 'unauthenticated';
        state.user = null;
      });
  },
});

export const { clearError, setUnauthenticated } = authSlice.actions;
export default authSlice.reducer;
