import { EmptyState, StatusPill } from '@/components';
import type { StatusVariant } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { useNetworkRecovery } from '@/hooks/useNetworkRecovery';
import { fetchPdpGoals, selectAllPdpGoals } from '@/store';
import { useTheme } from '@/theme';
import { PdpGoalStatus, type PdpGoalResponse } from '@acme/shared';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useOfflineAwareInsets } from '@/hooks/useOfflineAwareInsets';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatReviewDate(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function getPdpGoalStatusDisplay(status: PdpGoalStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case PdpGoalStatus.STARTED:
      return { label: 'Started', variant: 'success' };
    case PdpGoalStatus.COMPLETED:
      return { label: 'Completed', variant: 'info' };
    default:
      return { label: 'Unknown', variant: 'default' };
  }
}

const STATUS_FILTERS: { label: string; value: PdpGoalStatus | null }[] = [
  { label: 'All', value: null },
  { label: 'Started', value: PdpGoalStatus.STARTED },
  { label: 'Completed', value: PdpGoalStatus.COMPLETED },
];

function GoalListItem({ item, onPress }: { item: PdpGoalResponse; onPress: () => void }) {
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
            Completed {formatReviewDate(item.completedAt)}
          </Text>
        ) : item.reviewDate ? (
          <Text style={[styles.listItemMeta, { color: colors.textSecondary }]}>
            Review by {formatReviewDate(item.reviewDate)}
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

  const goals = useAppSelector(selectAllPdpGoals);
  const loading = useAppSelector((state) => state.pdpGoals.loading);
  const error = useAppSelector((state) => state.pdpGoals.error);

  const [activeFilter, setActiveFilter] = useState<PdpGoalStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    dispatch(fetchPdpGoals());
  }, [dispatch]);

  // Refetch goals when connectivity returns, only if data is missing or errored
  useNetworkRecovery(
    useCallback(() => {
      if (!loading && (goals.length === 0 || error)) {
        dispatch(fetchPdpGoals());
      }
    }, [dispatch, loading, goals.length, error])
  );

  const filteredGoals = useMemo(() => {
    if (activeFilter === null) return goals;
    return goals.filter((g) => g.status === activeFilter);
  }, [goals, activeFilter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(fetchPdpGoals());
    setRefreshing(false);
  }, [dispatch]);

  const handleGoalPress = useCallback(
    (goal: PdpGoalResponse) => {
      router.push(`/(pdp-goal)/${goal.id}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: PdpGoalResponse }) => (
      <GoalListItem item={item} onPress={() => handleGoalPress(item)} />
    ),
    [handleGoalPress]
  );

  const keyExtractor = useCallback((item: PdpGoalResponse) => item.id, []);

  const isInitialLoad = loading && goals.length === 0;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>PDP</Text>
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

      {isInitialLoad ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && goals.length === 0 ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Something went wrong"
          description={error}
          actionLabel="Try again"
          onAction={() => dispatch(fetchPdpGoals())}
        />
      ) : filteredGoals.length === 0 ? (
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
          data={filteredGoals}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
