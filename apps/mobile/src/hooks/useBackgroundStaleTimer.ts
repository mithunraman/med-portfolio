import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { STALE_THRESHOLD_MS } from '../constants/staleness';
import { markArtefactsStale, markDashboardStale, markPdpGoalsStale } from '../store';
import { useAppDispatch } from './useAppDispatch';

/**
 * Marks artefacts, PDP goals, and dashboard data as stale when
 * the app returns from background after more than 5 minutes.
 * List screens will refetch on next focus via useFocusEffect.
 */
export function useBackgroundStaleTimer() {
  const dispatch = useAppDispatch();
  const backgroundAtRef = useRef<number | null>(null);

  useEffect(() => {
    const handleChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundAtRef.current = Date.now();
      } else if (nextState === 'active' && backgroundAtRef.current) {
        const elapsed = Date.now() - backgroundAtRef.current;
        backgroundAtRef.current = null;
        if (elapsed > STALE_THRESHOLD_MS) {
          dispatch(markArtefactsStale());
          dispatch(markPdpGoalsStale());
          dispatch(markDashboardStale());
        }
      }
    };

    const sub = AppState.addEventListener('change', handleChange);
    return () => sub.remove();
  }, [dispatch]);
}
