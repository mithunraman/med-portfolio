import {
  EmptyState,
  FetchErrorBanner,
  FilterPillRow,
  LastUpdatedLabel,
  SkeletonList,
  StatusPill,
  WaveDots,
} from '@/components';
import { useAppSelector, useFilteredList } from '@/hooks';
import { useOfflineAwareInsets } from '@/hooks/useOfflineAwareInsets';
import {
  fetchPdpGoals,
  pdpGoalViewKey,
  resetPdpGoalView,
  selectPdpGoalFilterView,
  selectPdpGoalsByView,
  type PdpGoalEntity,
} from '@/store';
import { useTheme } from '@/theme';
import { formatDate } from '@/utils/formatDate';
import { getPdpGoalStatusDisplay } from '@/utils/pdpGoalStatus';
import { PdpGoalStatus } from '@acme/shared';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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
  const router = useRouter();

  const [activeFilter, setActiveFilter] = useState<PdpGoalStatus | null>(null);

  const key = pdpGoalViewKey(activeFilter);
  const displayedGoals = useAppSelector((state) => selectPdpGoalsByView(state, key));
  const error = useAppSelector((state) => state.pdpGoals.error);

  const {
    currentView,
    lastFetchedAt,
    fetchError,
    setFetchError,
    isInitialLoad,
    showDot,
    handleRefresh,
    handleLoadMore,
    doFetch,
  } = useFilteredList<PdpGoalStatus>({
    activeFilter,
    selectView: (state) => selectPdpGoalFilterView(state, key),
    selectItems: (state) => selectPdpGoalsByView(state, key),
    selectError: (state) => state.pdpGoals.error,
    selectStale: (state) => state.pdpGoals.stale,
    fetchThunk: fetchPdpGoals,
    isRejected: fetchPdpGoals.rejected.match,
    resetViewAction: resetPdpGoalView,
    viewKeyFn: pdpGoalViewKey,
  });

  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + 16 }],
    [insets.bottom],
  );

  const handleGoalPress = useCallback(
    (goal: PdpGoalEntity) => {
      router.push(`/(pdp-goal)/${goal.id}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: PdpGoalEntity }) => (
      <GoalListItem item={item} onPress={() => handleGoalPress(item)} />
    ),
    [handleGoalPress],
  );

  const keyExtractor = useCallback((item: PdpGoalEntity) => item.id, []);

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

      <FilterPillRow
        filters={STATUS_FILTERS}
        activeFilter={activeFilter}
        onSelect={setActiveFilter}
      />

      <View style={[styles.waveDotsRow, !showDot && styles.waveDotsHidden]}>
        {showDot && <WaveDots color={colors.primary} />}
      </View>

      {fetchError && displayedGoals.length > 0 && (
        <FetchErrorBanner error={fetchError} onDismiss={() => setFetchError(null)} />
      )}

      {isInitialLoad ? (
        <SkeletonList />
      ) : error && displayedGoals.length === 0 ? (
        error.kind === 'network' ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="You're offline"
            description="Check your connection and try again."
            actionLabel="Retry"
            onAction={doFetch}
          />
        ) : (
          <EmptyState
            icon="alert-circle-outline"
            title="Something went wrong"
            description={error.message}
            actionLabel={error.retryable ? 'Try again' : undefined}
            onAction={error.retryable ? doFetch : undefined}
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
