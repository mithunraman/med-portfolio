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
  fetchArtefacts,
  resetView,
  selectArtefactsByView,
  selectFilterView,
  viewKey,
  type TypedError,
} from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import { ArtefactStatus, type Artefact } from '@acme/shared';
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

  const [activeFilter, setActiveFilter] = useState<ArtefactStatus | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const fetchingRef = useRef(false);
  const [fetchError, setFetchError] = useState<TypedError | null>(null);

  const key = viewKey(activeFilter);
  const currentView = useAppSelector((state) => selectFilterView(state, key));
  const displayedArtefacts = useAppSelector((state) => selectArtefactsByView(state, key));
  const error = useAppSelector((state) => state.artefacts.error);
  const stale = useAppSelector((state) => state.artefacts.stale);
  const lastFetchedAt = useAppSelector((state) => state.artefacts.lastFetchedAt);

  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + 16 }],
    [insets.bottom]
  );

  const doFetch = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsFetching(true);
    setFetchError(null);

    const result = await dispatch(fetchArtefacts({ status: activeFilter ?? undefined }));

    fetchingRef.current = false;
    setIsFetching(false);

    if (fetchArtefacts.rejected.match(result) && !result.meta.condition) {
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
  }, [activeFilter, currentView]);

  // Refetch on focus if stale
  useFocusEffect(
    useCallback(() => {
      const isExpired = lastFetchedAt != null && Date.now() - lastFetchedAt > STALE_THRESHOLD_MS;
      if ((stale || isExpired) && currentView?.status === 'idle') {
        dispatch(resetView(key));
        doFetchRef.current();
      }
    }, [stale, lastFetchedAt, currentView?.status, dispatch, key])
  );

  // Refetch on network recovery
  useNetworkRecovery(
    useCallback(() => {
      if (
        (!currentView || currentView.status === 'idle') &&
        (displayedArtefacts.length === 0 || error)
      ) {
        doFetchRef.current();
      }
    }, [currentView, displayedArtefacts.length, error])
  );

  // -- Pull to refresh --
  const handleRefresh = useCallback(() => {
    if (fetchingRef.current) return;
    dispatch(resetView(viewKey(activeFilter)));
    doFetchRef.current();
  }, [dispatch, activeFilter]);

  // -- Infinite scroll --
  const handleLoadMore = useCallback(() => {
    if (!currentView || currentView.status !== 'idle' || !currentView.nextCursor) return;
    dispatch(
      fetchArtefacts({
        status: activeFilter ?? undefined,
        cursor: currentView.nextCursor,
      })
    );
  }, [dispatch, activeFilter, currentView]);

  // -- Navigation --
  const handleEntryPress = useCallback(
    (item: Artefact) => {
      if (item.status >= ArtefactStatus.IN_REVIEW || item.status === ArtefactStatus.ARCHIVED) {
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

  // -- Derived state --
  const isInitialLoad =
    (currentView?.status === 'loading' && displayedArtefacts.length === 0) ||
    (!currentView && !error);
  const showDot =
    currentView?.status === 'loadingMore' || (isFetching && displayedArtefacts.length > 0);

  const renderFooter = useCallback(() => {
    if (currentView?.status !== 'loadingMore') return null;
    return <ActivityIndicator style={styles.footerSpinner} color={colors.primary} />;
  }, [currentView?.status, colors.primary]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Entries</Text>
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

      {fetchError && displayedArtefacts.length > 0 && (
        <FetchErrorBanner error={fetchError} onDismiss={() => setFetchError(null)} />
      )}

      {/* Content */}
      {isInitialLoad ? (
        <SkeletonList />
      ) : error && displayedArtefacts.length === 0 ? (
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
      ) : displayedArtefacts.length === 0 ? (
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
          data={displayedArtefacts}
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
  listItemTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  listItemMeta: {
    fontSize: 13,
  },
});
