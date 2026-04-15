import { EmptyState, StatusPill } from '@/components';
import type { StatusVariant } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchReviewPeriods, selectAllReviewPeriods } from '@/store';
import { useTheme } from '@/theme';
import { ReviewPeriodStatus, type ReviewPeriod } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function getReviewPeriodStatusDisplay(status: ReviewPeriodStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case ReviewPeriodStatus.ACTIVE:
      return { label: 'Active', variant: 'success' };
    case ReviewPeriodStatus.ARCHIVED:
      return { label: 'Archived', variant: 'default' };
    default:
      return { label: 'Unknown', variant: 'default' };
  }
}

const STATUS_FILTERS: { label: string; value: ReviewPeriodStatus | null }[] = [
  { label: 'All', value: null },
  { label: 'Active', value: ReviewPeriodStatus.ACTIVE },
  { label: 'Archived', value: ReviewPeriodStatus.ARCHIVED },
];

// ── List Item ────────────────────────────────────────────────────────────────

function ReviewPeriodListItem({
  item,
  onPress,
}: {
  item: ReviewPeriod;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const statusDisplay = getReviewPeriodStatusDisplay(item.status);

  return (
    <TouchableOpacity
      style={[styles.listItem, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Review period: ${item.name}`}
    >
      <View style={styles.listItemContent}>
        <Text style={[styles.listItemName, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.listItemDates, { color: colors.textSecondary }]}>
          {formatDate(item.startDate)} — {formatDate(item.endDate)}
        </Text>
      </View>
      <StatusPill label={statusDisplay.label} variant={statusDisplay.variant} />
    </TouchableOpacity>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function ReviewPeriodListScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const periods = useAppSelector(selectAllReviewPeriods);
  const loading = useAppSelector((state) => state.reviewPeriods.loading);
  const error = useAppSelector((state) => state.reviewPeriods.error);
  const stale = useAppSelector((state) => state.reviewPeriods.stale);

  const [activeFilter, setActiveFilter] = useState<ReviewPeriodStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    dispatch(fetchReviewPeriods());
  }, [dispatch]);

  useFocusEffect(
    useCallback(() => {
      if (stale) {
        dispatch(fetchReviewPeriods());
      }
    }, [stale, dispatch])
  );

  const filteredPeriods = useMemo(() => {
    if (activeFilter === null) return periods;
    return periods.filter((p) => p.status === activeFilter);
  }, [periods, activeFilter]);

  const hasActivePeriod = useMemo(
    () => periods.some((p) => p.status === ReviewPeriodStatus.ACTIVE),
    [periods]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(fetchReviewPeriods());
    setRefreshing(false);
  }, [dispatch]);

  const handlePeriodPress = useCallback(
    (period: ReviewPeriod) => {
      router.push(`/(review-period)/${period.id}`);
    },
    [router]
  );

  const handleCreate = useCallback(() => {
    router.push('/(review-period)/create');
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: ReviewPeriod }) => (
      <ReviewPeriodListItem item={item} onPress={() => handlePeriodPress(item)} />
    ),
    [handlePeriodPress]
  );

  const keyExtractor = useCallback((item: ReviewPeriod) => item.id, []);

  const isInitialLoad = loading && periods.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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

        <View style={styles.filterSpacer} />

        {!hasActivePeriod && (
          <Pressable onPress={handleCreate} hitSlop={8} style={styles.addButton}>
            <Ionicons name="add-circle" size={28} color={colors.primary} />
          </Pressable>
        )}
      </View>

      {isInitialLoad ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && periods.length === 0 ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Something went wrong"
          description={error}
          actionLabel="Try again"
          onAction={() => dispatch(fetchReviewPeriods())}
        />
      ) : filteredPeriods.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={activeFilter !== null ? 'No review periods with this status' : 'No review periods yet'}
          description={
            activeFilter !== null
              ? 'Try a different filter.'
              : 'Create a review period to track your ARCP curriculum coverage.'
          }
          actionLabel={activeFilter === null ? 'Create review period' : undefined}
          onAction={activeFilter === null ? handleCreate : undefined}
        />
      ) : (
        <FlatList
          data={filteredPeriods}
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

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  filterSpacer: {
    flex: 1,
  },
  addButton: {
    padding: 2,
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
  listItemName: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  listItemDates: {
    fontSize: 13,
  },
});
