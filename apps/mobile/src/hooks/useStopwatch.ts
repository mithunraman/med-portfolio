import { useCallback, useEffect, useReducer, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

type StopwatchStatus = 'idle' | 'running' | 'paused';

interface StopwatchState {
  status: StopwatchStatus;
  elapsedMs: number;
  startTimestamp: number | null;
  accumulatedMs: number;
}

type StopwatchAction =
  | { type: 'START'; initialMs?: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'TICK' }
  | { type: 'RESET' };

interface UseStopwatchOptions {
  /** Initial elapsed time in milliseconds */
  initialMs?: number;
  /** Update interval in milliseconds (default: 100) */
  interval?: number;
  /** Auto-start the stopwatch */
  autoStart?: boolean;
}

interface UseStopwatchReturn {
  /** Current elapsed time in milliseconds */
  elapsedMs: number;
  /** Current status of the stopwatch */
  status: StopwatchStatus;
  /** Whether the stopwatch is currently running */
  isRunning: boolean;
  /** Whether the stopwatch is paused */
  isPaused: boolean;
  /** Start the stopwatch */
  start: (initialMs?: number) => void;
  /** Pause the stopwatch */
  pause: () => void;
  /** Resume the stopwatch from paused state */
  resume: () => void;
  /** Reset the stopwatch to initial state */
  reset: () => void;
  /** Toggle between running and paused */
  toggle: () => void;
}

// ============================================================================
// REDUCER
// ============================================================================

function stopwatchReducer(state: StopwatchState, action: StopwatchAction): StopwatchState {
  switch (action.type) {
    case 'START': {
      const now = Date.now();
      const initialMs = action.initialMs ?? 0;
      return {
        status: 'running',
        elapsedMs: initialMs,
        startTimestamp: now,
        accumulatedMs: initialMs,
      };
    }
    case 'PAUSE': {
      if (state.status !== 'running') return state;
      const now = Date.now();
      const elapsed = state.accumulatedMs + (now - (state.startTimestamp ?? now));
      return {
        ...state,
        status: 'paused',
        elapsedMs: elapsed,
        startTimestamp: null,
      };
    }
    case 'RESUME': {
      if (state.status !== 'paused') return state;
      const now = Date.now();
      return {
        ...state,
        status: 'running',
        startTimestamp: now,
        accumulatedMs: state.elapsedMs,
      };
    }
    case 'TICK': {
      if (state.status !== 'running' || state.startTimestamp === null) {
        return state;
      }
      const now = Date.now();
      const elapsed = state.accumulatedMs + (now - state.startTimestamp);
      return {
        ...state,
        elapsedMs: elapsed,
      };
    }
    case 'RESET': {
      return {
        status: 'idle',
        elapsedMs: 0,
        startTimestamp: null,
        accumulatedMs: 0,
      };
    }
    default:
      return state;
  }
}

const initialState: StopwatchState = {
  status: 'idle',
  elapsedMs: 0,
  startTimestamp: null,
  accumulatedMs: 0,
};

// ============================================================================
// HOOK
// ============================================================================

export function useStopwatch(options: UseStopwatchOptions = {}): UseStopwatchReturn {
  const { initialMs = 0, interval = 100, autoStart = false } = options;

  const [state, dispatch] = useReducer(stopwatchReducer, initialState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart) {
      dispatch({ type: 'START', initialMs });
    }
  }, [autoStart, initialMs]);

  // Timer interval management
  useEffect(() => {
    if (state.status === 'running') {
      intervalRef.current = setInterval(() => {
        dispatch({ type: 'TICK' });
      }, interval);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.status, interval]);

  // Actions
  const start = useCallback((startInitialMs?: number) => {
    dispatch({ type: 'START', initialMs: startInitialMs });
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: 'PAUSE' });
  }, []);

  const resume = useCallback(() => {
    dispatch({ type: 'RESUME' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const toggle = useCallback(() => {
    if (state.status === 'running') {
      dispatch({ type: 'PAUSE' });
    } else if (state.status === 'paused') {
      dispatch({ type: 'RESUME' });
    } else {
      dispatch({ type: 'START', initialMs });
    }
  }, [state.status, initialMs]);

  return {
    elapsedMs: state.elapsedMs,
    status: state.status,
    isRunning: state.status === 'running',
    isPaused: state.status === 'paused',
    start,
    pause,
    resume,
    reset,
    toggle,
  };
}

export default useStopwatch;
