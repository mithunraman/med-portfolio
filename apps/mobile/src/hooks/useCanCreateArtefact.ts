import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useAppSelector } from './useAppSelector';

export interface CanCreateArtefactResult {
  canCreate: boolean;
  /** Returns true if the action should proceed; otherwise routes to upgrade and returns false. */
  guard: () => boolean;
}

export function useCanCreateArtefact(): CanCreateArtefactResult {
  const reached = useAppSelector((s) => s.auth.guestArtefactLimitReached);
  const router = useRouter();

  const guard = useCallback(() => {
    if (reached) {
      router.push('/claim-account');
      return false;
    }
    return true;
  }, [reached, router]);

  return { canCreate: !reached, guard };
}
