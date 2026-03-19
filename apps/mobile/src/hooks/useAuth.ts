import { useCallback } from 'react';
import {
  claimGuest as claimGuestAction,
  logout as logoutAction,
  otpSend as otpSendAction,
  otpVerify as otpVerifyAction,
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

  const otpSend = useCallback(
    async (email: string) => {
      const result = await dispatch(otpSendAction(email));
      if (otpSendAction.rejected.match(result)) {
        throw new Error(result.payload as string);
      }
    },
    [dispatch]
  );

  const otpVerify = useCallback(
    async (email: string, code: string) => {
      const result = await dispatch(otpVerifyAction({ email, code }));
      if (otpVerifyAction.rejected.match(result)) {
        throw new Error(result.payload as string);
      }
    },
    [dispatch]
  );

  const claimGuest = useCallback(
    async (email: string, code: string, name?: string) => {
      const result = await dispatch(claimGuestAction({ email, code, name }));
      if (claimGuestAction.rejected.match(result)) {
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
    otpSend,
    otpVerify,
    claimGuest,
    registerGuest,
    logout,
  };
}
