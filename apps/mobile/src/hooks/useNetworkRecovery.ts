import { useEffect, useRef } from 'react';
import { selectIsOffline } from '@/store/slices/networkSlice';
import { useAppSelector } from './useAppSelector';

/**
 * Calls `onReconnect` when the device transitions from offline to online.
 * Use on screens that should refetch data after connectivity returns.
 */
export function useNetworkRecovery(onReconnect: () => void): void {
  const isOffline = useAppSelector(selectIsOffline);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (isOffline) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      onReconnect();
    }
  }, [isOffline, onReconnect]);
}
