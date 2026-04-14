import { EmptyState, StatusPill } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { useNetworkRecovery } from '@/hooks/useNetworkRecovery';
import { fetchArtefacts, selectAllArtefacts, type TypedError } from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import { ArtefactStatus, type Artefact } from '@acme/shared';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useOfflineAwareInsets } from '@/hooks/useOfflineAwareInsets';
import { STALE_THRESHOLD_MS } from '@/constants/staleness';

// Status filter options — using null to mean "All"
const STATUS_FILTERS: { label: string; value: ArtefactStatus | null }[] = [
  { label: 'All', value: null },
  { label: 'In progress', value: ArtefactStatus.IN_CONVERSATION },
  { label: 'Needs review', value: ArtefactStatus.IN_REVIEW },
  { label: 'Completed', value: ArtefactStatus.COMPLETED },
  { label: 'Archived', value: ArtefactStatus.ARCHIVED },
];

function formatTimeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function EntryListItem({ item, onPress }: { item: Artefact; onPress: () => void }) {
  const { colors } = useTheme();
  const statusDisplay = getArtefactStatusDisplay(item.status);

  return (
    <TouchableOpacity
      style={[styles.listItem, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Entry: ${item.title || 'Untitled'}`}
    >
      <View style={styles.listItemContent}>
        <Text style={[styles.listItemTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title || 'Untitled entry'}
        </Text>
        <Text style={[styles.listItemMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.artefactTypeLabel ? `${item.artefactTypeLabel} · ` : ''}Updated{' '}
          {formatTimeAgo(item.updatedAt)}
        </Text>
      </View>
      <StatusPill label={statusDisplay.label} variant={statusDisplay.variant} />
    </TouchableOpacity>
  );
}

export default function EntriesScreen() {
  const insets = useOfflineAwareInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const artefacts = useAppSelector(selectAllArtefacts);
  const loading = useAppSelector((state) => state.artefacts.loading);
  const error = useAppSelector((state) => state.artefacts.error);
  const stale = useAppSelector((state) => state.artefacts.stale);
  const lastFetchedAt = useAppSelector((state) => state.artefacts.lastFetchedAt);

  const [activeFilter, setActiveFilter] = useState<ArtefactStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + 16 }],
    [insets.bottom],
  );

  useEffect(() => {
    dispatch(fetchArtefacts());
  }, [dispatch]);

  // Refetch entries on focus when data has been invalidated or is older than STALE_THRESHOLD_MS
  useFocusEffect(
    useCallback(() => {
      const isExpired = lastFetchedAt != null && Date.now() - lastFetchedAt > STALE_THRESHOLD_MS;
      if ((stale || isExpired) && !loading) {
        dispatch(fetchArtefacts());
      }
    }, [stale, loading, lastFetchedAt, dispatch])
  );

  // Refetch entries when connectivity returns, only if data is missing or errored
  useNetworkRecovery(
    useCallback(() => {
      if (!loading && (artefacts.length === 0 || error)) {
        dispatch(fetchArtefacts());
      }
    }, [dispatch, loading, artefacts.length, error])
  );

  const filteredArtefacts = useMemo(() => {
    if (activeFilter === null) return artefacts;
    return artefacts.filter((a) => a.status === activeFilter);
  }, [artefacts, activeFilter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const result = await dispatch(fetchArtefacts());
    setRefreshing(false);
    if (fetchArtefacts.rejected.match(result) && artefacts.length > 0) {
      const err = result.payload as TypedError | undefined;
      const message =
        err?.kind === 'network'
          ? 'Check your connection and try again.'
          : err?.message ?? 'Something went wrong.';
      Alert.alert('Couldn\u2019t refresh', message);
    }
  }, [dispatch, artefacts.length]);

  const handleEntryPress = useCallback(
    (item: Artefact) => {
      if (item.status >= ArtefactStatus.IN_REVIEW) {
        router.push(`/(entry)/${item.id}`);
      } else {
        router.push(`/(messages)/${item.conversation.id}`);
      }
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Artefact }) => (
      <EntryListItem item={item} onPress={() => handleEntryPress(item)} />
    ),
    [handleEntryPress]
  );

  const keyExtractor = useCallback((item: Artefact) => item.id, []);

  const isInitialLoad = loading && artefacts.length === 0;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Entries</Text>
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

      {/* Content */}
      {isInitialLoad ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && artefacts.length === 0 ? (
        error.kind === 'network' ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="You're offline"
            description="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => dispatch(fetchArtefacts())}
          />
        ) : (
          <EmptyState
            icon="alert-circle-outline"
            title="Something went wrong"
            description={error.message}
            actionLabel={error.retryable ? 'Try again' : undefined}
            onAction={error.retryable ? () => dispatch(fetchArtefacts()) : undefined}
          />
        )
      ) : filteredArtefacts.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title={activeFilter !== null ? 'No entries with this status' : 'No entries yet'}
          description={
            activeFilter !== null
              ? 'Try a different filter or create a new entry.'
              : 'After your next clinic, tap the mic on the Home tab and talk through what happened.'
          }
        />
      ) : (
        <FlatList
          data={filteredArtefacts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={listContentStyle}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
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
  listItemTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  listItemMeta: {
    fontSize: 13,
  },
});
