import { setNetworkStatus } from '@/store/slices/networkSlice';
import * as Network from 'expo-network';
import { useEffect } from 'react';
import { useAppDispatch } from './useAppDispatch';

/**
 * Subscribes to device network state changes and syncs to Redux.
 * Call once in the root layout.
 */
export function useNetworkListener(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const subscription = Network.addNetworkStateListener((state) => {
      dispatch(
        setNetworkStatus({
          isConnected: state.isConnected ?? true,
          isInternetReachable: state.isInternetReachable ?? true,
        })
      );
    });

    // Fetch initial state
    Network.getNetworkStateAsync().then((state) => {
      dispatch(
        setNetworkStatus({
          isConnected: state.isConnected ?? true,
          isInternetReachable: state.isInternetReachable ?? true,
        })
      );
    });

    return () => subscription.remove();
  }, [dispatch]);
}
