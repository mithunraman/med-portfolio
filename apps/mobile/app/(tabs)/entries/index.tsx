import { EmptyState, StatusPill } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchArtefacts, selectAllArtefacts } from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import type { Artefact, ArtefactStatus } from '@acme/shared';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Status filter options — using null to mean "All"
const STATUS_FILTERS: { label: string; value: ArtefactStatus | null }[] = [
  { label: 'All', value: null },
  { label: 'Draft', value: 100 as ArtefactStatus },
  { label: 'Needs review', value: 300 as ArtefactStatus },
  { label: 'Ready to export', value: 400 as ArtefactStatus },
  { label: 'Exported', value: 500 as ArtefactStatus },
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
          {item.artefactType ? `${item.artefactType} · ` : ''}Updated {formatTimeAgo(item.updatedAt)}
        </Text>
      </View>
      <StatusPill label={statusDisplay.label} variant={statusDisplay.variant} />
    </TouchableOpacity>
  );
}

export default function EntriesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const router = useRouter();

  const artefacts = useAppSelector(selectAllArtefacts);
  const loading = useAppSelector((state) => state.artefacts.loading);
  const error = useAppSelector((state) => state.artefacts.error);

  const [activeFilter, setActiveFilter] = useState<ArtefactStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    dispatch(fetchArtefacts());
  }, [dispatch]);

  const filteredArtefacts = useMemo(() => {
    if (activeFilter === null) return artefacts;
    return artefacts.filter((a) => a.status === activeFilter);
  }, [artefacts, activeFilter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(fetchArtefacts());
    setRefreshing(false);
  }, [dispatch]);

  const handleEntryPress = useCallback(
    (item: Artefact) => {
      router.push(`/(messages)/${item.conversation.id}`);
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
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
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
        <EmptyState
          icon="alert-circle-outline"
          title="Something went wrong"
          description={error}
          actionLabel="Try again"
          onAction={() => dispatch(fetchArtefacts())}
        />
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
