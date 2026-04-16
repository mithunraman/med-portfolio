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
  fetchArtefacts,
  resetView,
  selectArtefactsByView,
  selectFilterView,
  viewKey,
} from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import { formatTimeAgo } from '@/utils/formatTimeAgo';
import { ArtefactStatus, type Artefact } from '@acme/shared';
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

const STATUS_FILTERS: { label: string; value: ArtefactStatus | null }[] = [
  { label: 'All', value: null },
  { label: 'In progress', value: ArtefactStatus.IN_CONVERSATION },
  { label: 'Needs review', value: ArtefactStatus.IN_REVIEW },
  { label: 'Completed', value: ArtefactStatus.COMPLETED },
  { label: 'Archived', value: ArtefactStatus.ARCHIVED },
];

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
  const router = useRouter();

  const [activeFilter, setActiveFilter] = useState<ArtefactStatus | null>(null);

  const key = viewKey(activeFilter);
  const displayedArtefacts = useAppSelector((state) => selectArtefactsByView(state, key));
  const error = useAppSelector((state) => state.artefacts.error);

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
  } = useFilteredList<ArtefactStatus>({
    activeFilter,
    selectView: (state) => selectFilterView(state, key),
    selectItems: (state) => selectArtefactsByView(state, key),
    selectError: (state) => state.artefacts.error,
    selectStale: (state) => state.artefacts.stale,
    fetchThunk: fetchArtefacts,
    isRejected: fetchArtefacts.rejected.match,
    resetViewAction: resetView,
    viewKeyFn: viewKey,
  });

  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: insets.bottom + 16 }],
    [insets.bottom]
  );

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

      <FilterPillRow
        filters={STATUS_FILTERS}
        activeFilter={activeFilter}
        onSelect={setActiveFilter}
      />

      <View style={[styles.waveDotsRow, !showDot && styles.waveDotsHidden]}>
        {showDot && <WaveDots color={colors.primary} />}
      </View>

      {fetchError && displayedArtefacts.length > 0 && (
        <FetchErrorBanner error={fetchError} onDismiss={() => setFetchError(null)} />
      )}

      {isInitialLoad ? (
        <SkeletonList />
      ) : error && displayedArtefacts.length === 0 ? (
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
