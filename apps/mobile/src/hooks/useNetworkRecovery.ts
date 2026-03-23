import { selectIsOffline } from '@/store/slices/networkSlice';
import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { useAppSelector } from './useAppSelector';

/**
 * Calls `onReconnect` when the device transitions from offline to online,
 * but only if the screen is currently focused. Background tabs won't fire.
 */
export function useNetworkRecovery(onReconnect: () => void): void {
  const isOffline = useAppSelector(selectIsOffline);
  const isFocused = useIsFocused();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (isOffline) {
      wasOffline.current = true;
    } else if (wasOffline.current && isFocused) {
      wasOffline.current = false;
      onReconnect();
    }
  }, [isOffline, isFocused, onReconnect]);
}
