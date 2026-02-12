import type { LoginRequest, RegisterRequest } from '@acme/shared';
import { useCallback } from 'react';
import {
  login as loginAction,
  logout as logoutAction,
  register as registerAction,
  registerGuest as registerGuestAction,
} from '../store';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';

/**
 * Convenience hook for auth operations.
 * Wraps Redux actions with a familiar API.
 */
export function useAuth() {
  const dispatch = useAppDispatch();
  const { status, user, error } = useAppSelector((state) => state.auth);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const result = await dispatch(loginAction(credentials));
      if (loginAction.rejected.match(result)) {
        throw new Error(result.payload as string);
      }
    },
    [dispatch]
  );

  const register = useCallback(
    async (data: RegisterRequest & { password: string }) => {
      const result = await dispatch(registerAction(data));
      if (registerAction.rejected.match(result)) {
        throw new Error(result.payload as string);
      }
    },
    [dispatch]
  );

  const registerGuest = useCallback(async () => {
    const result = await dispatch(registerGuestAction());
    if (registerGuestAction.rejected.match(result)) {
      throw new Error(result.payload as string);
    }
  }, [dispatch]);

  const logout = useCallback(async () => {
    await dispatch(logoutAction());
  }, [dispatch]);

  return {
    // State
    user,
    status,
    error,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    isGuest: status === 'guest',
    isLoggedIn: status === 'authenticated' || status === 'guest',

    // Actions
    login,
    register,
    registerGuest,
    logout,
  };
}
