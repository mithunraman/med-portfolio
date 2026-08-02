import { useLoading } from '@/components';
import { logout, requestDeletion } from '@/store/slices/authSlice';
import { logger } from '@/utils/logger';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useAppDispatch } from './useAppDispatch';

const guestDeletionLogger = logger.createScope('GuestDeletion');

/**
 * Deletes a guest account and signs out.
 *
 * App Store Review Guideline 5.1.1(v) covers automatically generated ("guest")
 * accounts, so a guest needs a real deletion route and not just a way to walk
 * away from the session. `POST /auth/guest` mints a genuine user record, and a
 * guest can create entries against it, so abandoning the session would leave
 * clinical content on the server with nothing left that could ever delete it.
 *
 * Sign-out is conditional on the delete succeeding. Signing out regardless
 * would strand exactly that state — data on the server, no session left to
 * delete it from — which is the gap this flow exists to close. On failure the
 * caller stays put with the account intact and can retry.
 *
 * The blocking HUD lives here rather than in the callers so every entry point
 * gets it; there is a network round-trip between the tap and the sign-out, and
 * without it the screen sits inert while a destructive call is in flight.
 *
 * @returns `true` if the account was deleted and the user signed out.
 */
export function useGuestDeletion() {
  const dispatch = useAppDispatch();
  const { showLoading, hideLoading } = useLoading();

  const deleteGuestAccount = useCallback(async (): Promise<boolean> => {
    // dismissibleAfterSec matches the message-delete HUD: if the request hangs,
    // the user must not be trapped behind a modal they can't dismiss.
    showLoading('Deleting your data...', { dismissibleAfterSec: 5 });

    let failure: unknown = null;
    try {
      await dispatch(requestDeletion()).unwrap();
      await dispatch(logout());
    } catch (error) {
      failure = error;
    } finally {
      hideLoading();
    }

    if (!failure) return true;

    // Alerted after hideLoading — a native alert raised while the HUD's modal
    // is still mounted can end up presented behind it.
    guestDeletionLogger.warn('Guest account deletion failed', { error: failure });
    Alert.alert(
      'Could not delete',
      "We couldn't delete your guest data. Check your connection and try again."
    );
    return false;
  }, [dispatch, showLoading, hideLoading]);

  return { deleteGuestAccount };
}
