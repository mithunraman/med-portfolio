import { STALE_THRESHOLD_MS } from '@/constants/staleness';
import type { FilterView, TypedError, RootState } from '@/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAppDispatch } from './useAppDispatch';
import { useAppSelector } from './useAppSelector';
import { useNetworkRecovery } from './useNetworkRecovery';
import type { PayloadAction, SerializedError } from '@reduxjs/toolkit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThunkResult {
  type: string;
  payload?: unknown;
  meta: { condition?: boolean; requestStatus: string };
  error?: SerializedError;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FetchThunk<TFilter> = (args?: { status?: TFilter; cursor?: string }) => any;

interface UseFilteredListConfig<TFilter extends number> {
  activeFilter: TFilter | null;
  selectView: (state: RootState) => FilterView | undefined;
  selectItems: (state: RootState) => { id: string }[];
  selectError: (state: RootState) => TypedError | null;
  selectStale: (state: RootState) => boolean;
  fetchThunk: FetchThunk<TFilter>;
  isRejected: (result: ThunkResult) => boolean;
  resetViewAction: (key: string) => PayloadAction<string>;
  viewKeyFn: (filter: TFilter | null) => string;
}

interface UseFilteredListResult {
  currentView: FilterView | undefined;
  lastFetchedAt: number | null;
  fetchError: TypedError | null;
  setFetchError: (e: TypedError | null) => void;
  isInitialLoad: boolean;
  showDot: boolean;
  handleRefresh: () => void;
  handleLoadMore: () => void;
  doFetch: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFilteredList<TFilter extends number>(
  config: UseFilteredListConfig<TFilter>,
): UseFilteredListResult {
  const {
    activeFilter,
    selectView,
    selectItems,
    selectError,
    selectStale,
    fetchThunk,
    isRejected,
    resetViewAction,
    viewKeyFn,
  } = config;

  const dispatch = useAppDispatch();
  const fetchingRef = useRef(false);
  const [fetchError, setFetchError] = useState<TypedError | null>(null);

  const currentView = useAppSelector(selectView);
  const displayedItems = useAppSelector(selectItems);
  const error = useAppSelector(selectError);
  const stale = useAppSelector(selectStale);
  const lastFetchedAt = currentView?.lastFetchedAt ?? null;

  const key = viewKeyFn(activeFilter);

  const doFetch = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setFetchError(null);

    const result = await dispatch(fetchThunk({ status: activeFilter ?? undefined }));

    fetchingRef.current = false;

    if (isRejected(result) && !result.meta.condition) {
      setFetchError(result.payload as TypedError);
    }
  }, [dispatch, fetchThunk, isRejected, activeFilter]);

  const doFetchRef = useRef(doFetch);
  doFetchRef.current = doFetch;

  // Fetch on mount and on filter change if no cached view
  useEffect(() => {
    if (!currentView) {
      doFetchRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on filter change, not on view invalidation
  }, [activeFilter]);

  // Refetch on focus if stale
  useFocusEffect(
    useCallback(() => {
      const isExpired = lastFetchedAt != null && Date.now() - lastFetchedAt > STALE_THRESHOLD_MS;
      if ((stale || isExpired) && currentView?.status === 'idle') {
        dispatch(resetViewAction(key));
        doFetchRef.current();
      }
    }, [stale, lastFetchedAt, currentView?.status, dispatch, resetViewAction, key]),
  );

  // Refetch on network recovery
  useNetworkRecovery(
    useCallback(() => {
      if (
        (!currentView || currentView.status === 'idle') &&
        (displayedItems.length === 0 || error)
      ) {
        doFetchRef.current();
      }
    }, [currentView, displayedItems.length, error]),
  );

  // Pull to refresh
  const handleRefresh = useCallback(() => {
    if (fetchingRef.current) return;
    dispatch(resetViewAction(viewKeyFn(activeFilter)));
    doFetchRef.current();
  }, [dispatch, resetViewAction, viewKeyFn, activeFilter]);

  // Infinite scroll
  const handleLoadMore = useCallback(() => {
    if (!currentView || currentView.status !== 'idle' || !currentView.nextCursor) return;
    dispatch(
      fetchThunk({
        status: activeFilter ?? undefined,
        cursor: currentView.nextCursor,
      }),
    );
  }, [dispatch, fetchThunk, activeFilter, currentView]);

  // Derived state
  const isInitialLoad =
    (currentView?.status === 'loading' && displayedItems.length === 0) ||
    (!currentView && !error);
  const showDot =
    currentView?.status === 'loadingMore' ||
    (currentView?.status === 'loading' && displayedItems.length > 0);

  return {
    currentView,
    lastFetchedAt,
    fetchError,
    setFetchError,
    isInitialLoad,
    showDot,
    handleRefresh,
    handleLoadMore,
    doFetch: () => doFetchRef.current(),
  };
}
