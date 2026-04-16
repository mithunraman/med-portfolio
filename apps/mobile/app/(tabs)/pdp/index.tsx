import {
  EmptyState,
  FetchErrorBanner,
  LastUpdatedLabel,
  SkeletonList,
  StatusPill,
  WaveDots,
} from '@/components';
import { STALE_THRESHOLD_MS } from '@/constants/staleness';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { useNetworkRecovery } from '@/hooks/useNetworkRecovery';
import { useOfflineAwareInsets } from '@/hooks/useOfflineAwareInsets';
import {
  fetchPdpGoals,
  pdpGoalViewKey,
  resetPdpGoalView,
  selectPdpGoalFilterView,
  selectPdpGoalsByView,
  type PdpGoalEntity,
  type TypedError,
} from '@/store';
import { useTheme } from '@/theme';
import { formatDate } from '@/utils/formatDate';
import { getPdpGoalStatusDisplay } from '@/utils/pdpGoalStatus';
import { PdpGoalStatus } from '@acme/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';


const STATUS_FILTERS: { label: string; value: PdpGoalStatus | null }[] = [
  { label: 'All', value: null },
  { label: 'Started', value: PdpGoalStatus.STARTED },
  { label: 'Completed', value: PdpGoalStatus.COMPLETED },
  { label: 'Archived', value: PdpGoalStatus.ARCHIVED },
];

function GoalListItem({ item, onPress }: { item: PdpGoalEntity; onPress: () => void }) {
  const { colors } = useTheme();
  const statusDisplay = getPdpGoalStatusDisplay(item.status);

  return (
    <TouchableOpacity
      style={[styles.listItem, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`PDP goal: ${item.goal}`}
    >
      <View style={styles.listItemContent}>
        <Text style={[styles.listItemGoal, { color: colors.text }]} numberOfLines={2}>
          {item.goal}
        </Text>
        {item.status === PdpGoalStatus.COMPLETED && item.completedAt ? (
          <Text style={[styles.listItemMeta, { color: colors.textSecondary }]}>
            Completed {formatDate(item.completedAt)}
          </Text>
        ) : item.reviewDate ? (
          <Text style={[styles.listItemMeta, { color: colors.textSecondary }]}>
            Review by {formatDate(item.reviewDate)}
          </Text>
        ) : (
          <Text style={[styles.listItemMeta, { color: colors.textSecondary }]}>
            No review date set
          </Text>
        )}
      </View>
      <StatusPill label={statusDisplay.label} variant={statusDisplay.variant} />
    </TouchableOpacity>
  );
}

export default function PdpScreen() {
  const insets = useOfflineAwareInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [activeFilter, setActiveFilter] = useState<PdpGoalStatus | null>(null);
  const fetchingRef = useRef(false);
  const [fetchError, setFetchError] = useState<TypedError | null>(null);

  const key = pdpGoalViewKey(activeFilter);
  const currentView = useAppSelector((state) => selectPdpGoalFilterView(state, key));
  const displayedGoals = useAppSelector((state) => selectPdpGoalsByView(state, key));
  const error = useAppSelector((state) => state.pdpGoals.error);
  const stale = useAppSelector((state) => state.pdpGoals.stale);
  const lastFetchedAt = currentView?.lastFetchedAt ?? null;

  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + 16 }],
    [insets.bottom]
  );

  const doFetch = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setFetchError(null);

    const result = await dispatch(fetchPdpGoals({ status: activeFilter ?? undefined }));

    fetchingRef.current = false;

    if (fetchPdpGoals.rejected.match(result) && !result.meta.condition) {
      setFetchError(result.payload as TypedError);
    }
  }, [dispatch, activeFilter]);

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
        dispatch(resetPdpGoalView(key));
        doFetchRef.current();
      }
    }, [stale, lastFetchedAt, currentView?.status, dispatch, key])
  );

  // Refetch on network recovery
  useNetworkRecovery(
    useCallback(() => {
      if (
        (!currentView || currentView.status === 'idle') &&
        (displayedGoals.length === 0 || error)
      ) {
        doFetchRef.current();
      }
    }, [currentView, displayedGoals.length, error])
  );

  const handleRefresh = useCallback(() => {
    if (fetchingRef.current) return;
    dispatch(resetPdpGoalView(pdpGoalViewKey(activeFilter)));
    doFetchRef.current();
  }, [dispatch, activeFilter]);

  const handleLoadMore = useCallback(() => {
    if (!currentView || currentView.status !== 'idle' || !currentView.nextCursor) return;
    dispatch(
      fetchPdpGoals({
        status: activeFilter ?? undefined,
        cursor: currentView.nextCursor,
      })
    );
  }, [dispatch, activeFilter, currentView]);

  const handleGoalPress = useCallback(
    (goal: PdpGoalEntity) => {
      router.push(`/(pdp-goal)/${goal.id}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: PdpGoalEntity }) => (
      <GoalListItem item={item} onPress={() => handleGoalPress(item)} />
    ),
    [handleGoalPress]
  );

  const keyExtractor = useCallback((item: PdpGoalEntity) => item.id, []);

  const isInitialLoad =
    (currentView?.status === 'loading' && displayedGoals.length === 0) || (!currentView && !error);
  const showDot =
    currentView?.status === 'loadingMore' ||
    (currentView?.status === 'loading' && displayedGoals.length > 0);

  const renderFooter = useCallback(() => {
    if (currentView?.status !== 'loadingMore') return null;
    return <ActivityIndicator style={styles.footerSpinner} color={colors.primary} />;
  }, [currentView?.status, colors.primary]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>PDP</Text>
        <LastUpdatedLabel timestamp={lastFetchedAt} />
      </View>

      {/* Status filter pills */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.label}
            style={[
              styles.filterPill,
              {
                backgroundColor: activeFilter === filter.value ? colors.primary : colors.surface,
                borderColor: activeFilter === filter.value ? colors.primary : colors.border,
              },
            ]}
            onPress={() => setActiveFilter(filter.value)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterPillText,
                { color: activeFilter === filter.value ? '#fff' : colors.text },
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.waveDotsRow, !showDot && styles.waveDotsHidden]}>
        {showDot && <WaveDots color={colors.primary} />}
      </View>

      {fetchError && displayedGoals.length > 0 && (
        <FetchErrorBanner error={fetchError} onDismiss={() => setFetchError(null)} />
      )}

      {/* Content */}
      {isInitialLoad ? (
        <SkeletonList />
      ) : error && displayedGoals.length === 0 ? (
        error.kind === 'network' ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="You're offline"
            description="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => doFetchRef.current()}
          />
        ) : (
          <EmptyState
            icon="alert-circle-outline"
            title="Something went wrong"
            description={error.message}
            actionLabel={error.retryable ? 'Try again' : undefined}
            onAction={error.retryable ? () => doFetchRef.current() : undefined}
          />
        )
      ) : displayedGoals.length === 0 ? (
        <EmptyState
          icon="checkbox-outline"
          title={activeFilter !== null ? 'No goals with this status' : 'No PDP goals yet'}
          description={
            activeFilter !== null
              ? 'Try a different filter.'
              : 'PDP goals are created when you finalise an entry. Complete an entry to get started.'
          }
        />
      ) : (
        <FlatList
          data={displayedGoals}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={listContentStyle}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={['transparent']}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
  waveDotsRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  waveDotsHidden: {
    height: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  footerSpinner: {
    paddingVertical: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  listItemContent: {
    flex: 1,
    gap: 4,
  },
  listItemGoal: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  listItemMeta: {
    fontSize: 13,
  },
});
