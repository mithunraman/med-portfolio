import { SectionHeader, StatusPill } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchDashboard } from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import { ArtefactStatus, type Artefact, type PdpGoal } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// ─── Module A: Start New Entry ────────────────────────────────────────────────

const PROMPTS = [
  'What happened today worth keeping?',
  'Anything surprise you this week?',
  'Who did you help recently?',
  'What went better than expected?',
  'What would you do differently?',
];

function StartNewEntryCard({
  onPress,
  lastEntryDate,
}: {
  onPress: () => void;
  lastEntryDate?: string;
}) {
  const { colors } = useTheme();
  const prompt = useMemo(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)], []);
  const recency = lastEntryDate ? `Last entry ${formatTimeAgo(lastEntryDate)}` : null;

  return (
    <TouchableOpacity
      style={[styles.captureCard, { backgroundColor: colors.primary + '12' }]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="Start a new entry"
    >
      <View style={styles.captureTextContent}>
        <Text style={[styles.capturePrompt, { color: colors.text }]} numberOfLines={2}>
          {prompt}
        </Text>
        {recency ? (
          <Text style={[styles.captureHelper, { color: colors.textSecondary }]}>{recency}</Text>
        ) : null}
        <Text style={[styles.captureHelper, { color: colors.textSecondary }]}>
          Takes under a minute — just speak naturally.
        </Text>
      </View>
      <View style={[styles.micCircle, { backgroundColor: colors.primary }]}>
        <Ionicons name="mic" size={32} color="#fff" />
      </View>
    </TouchableOpacity>
  );
}

// ─── Module B: Recent Entries ─────────────────────────────────────────────────

function RecentEntryCard({ item, onPress }: { item: Artefact; onPress: () => void }) {
  const { colors } = useTheme();
  const statusDisplay = getArtefactStatusDisplay(item.status);

  return (
    <TouchableOpacity
      style={[styles.recentCard, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Resume entry: ${item.title || 'Untitled'}`}
    >
      <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={2}>
        {item.title || 'Untitled entry'}
      </Text>
      <StatusPill label={statusDisplay.label} variant={statusDisplay.variant} />
      <Text style={[styles.recentMeta, { color: colors.textSecondary }]}>
        {formatTimeAgo(item.updatedAt)}
      </Text>
    </TouchableOpacity>
  );
}

function RecentEntriesModule({
  items,
  total,
  onEntryPress,
  onSeeAll,
}: {
  items: Artefact[];
  total: number;
  onEntryPress: (item: Artefact) => void;
  onSeeAll: () => void;
}) {
  if (items.length === 0) {
    return (
      <View style={styles.moduleContainer}>
        <SectionHeader title="Recent entries" />
        <View style={styles.emptyModuleContainer}>
          <Text style={styles.emptyModuleText}>
            No entries yet. After your next clinic, tap the mic and talk through what happened.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.moduleContainer}>
      <SectionHeader
        title="Recent entries"
        actionLabel={total > items.length ? `See all (${total})` : 'See all'}
        onAction={onSeeAll}
      />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recentListContent}
        renderItem={({ item }) => (
          <RecentEntryCard item={item} onPress={() => onEntryPress(item)} />
        )}
      />
    </View>
  );
}

// ─── Module C: PDP Goals Due Soon ─────────────────────────────────────────────

function PdpDueSoonModule({ items, total }: { items: PdpGoal[]; total: number }) {
  const { colors } = useTheme();

  if (items.length === 0) {
    return (
      <View style={styles.moduleContainer}>
        <SectionHeader title="PDP goals due soon" />
        <View style={[styles.emptyModule, { backgroundColor: colors.surface }]}>
          <Ionicons name="checkbox-outline" size={24} color={colors.textSecondary} />
          <Text style={[styles.emptyModuleLabel, { color: colors.textSecondary }]}>
            No goals due right now.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.moduleContainer}>
      <SectionHeader
        title="PDP goals due soon"
        actionLabel={total > items.length ? `See all (${total})` : undefined}
      />
      {items.map((goal) => (
        <View key={goal.id} style={[styles.pdpActionCard, { backgroundColor: colors.surface }]}>
          <Ionicons name="flag-outline" size={18} color={colors.primary} />
          <View style={styles.pdpActionContent}>
            <Text style={[styles.pdpActionText, { color: colors.text }]} numberOfLines={2}>
              {goal.goal}
            </Text>
            <Text style={[styles.pdpActionMeta, { color: colors.textSecondary }]}>
              {goal.actions.length} action{goal.actions.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();

  const dispatch = useAppDispatch();

  const dashboardData = useAppSelector((state) => state.dashboard.data);

  useEffect(() => {
    dispatch(fetchDashboard());
  }, [dispatch]);

  const handleStartNew = useCallback(() => {
    const newConversationId = randomUUID();
    router.push(`/(messages)/${newConversationId}?isNew=true`);
  }, [router]);

  const handleEntryPress = useCallback(
    (item: Artefact) => {
      if (item.status >= ArtefactStatus.REVIEW) {
        router.push(`/(entry)/${item.id}`);
      } else {
        router.push(`/(messages)/${item.conversation.id}`);
      }
    },
    [router]
  );

  const handleSeeAllEntries = useCallback(() => {
    router.push('/(tabs)/entries');
  }, [router]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 16, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Home</Text>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate()}</Text>
        </View>

        {/* Module A: Start New Entry */}
        <StartNewEntryCard
          onPress={handleStartNew}
          lastEntryDate={dashboardData?.recentEntries.items[0]?.updatedAt}
        />

        {/* Module B: Recent Entries */}
        <RecentEntriesModule
          items={dashboardData?.recentEntries.items ?? []}
          total={dashboardData?.recentEntries.total ?? 0}
          onEntryPress={handleEntryPress}
          onSeeAll={handleSeeAllEntries}
        />

        {/* Module C: PDP Goals Due Soon */}
        <PdpDueSoonModule
          items={dashboardData?.pdpGoalsDue.items ?? []}
          total={dashboardData?.pdpGoalsDue.total ?? 0}
        />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: 8,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 14,
    marginTop: 2,
  },

  // Module A: Start New Entry
  captureCard: {
    marginHorizontal: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  micCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureTextContent: {
    flex: 1,
    gap: 3,
  },
  capturePrompt: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  captureHelper: {
    fontSize: 12,
    lineHeight: 16,
  },

  // Module B: Recent Entries
  moduleContainer: {
    marginTop: 8,
  },
  recentListContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  recentCard: {
    width: 160,
    padding: 14,
    borderRadius: 12,
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 120,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  recentMeta: {
    fontSize: 12,
  },
  emptyModuleContainer: {
    paddingHorizontal: 20,
  },
  emptyModuleText: {
    fontSize: 14,
    color: '#9b9a97',
    lineHeight: 20,
  },

  // Module C: PDP Action cards
  pdpActionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  pdpActionContent: {
    flex: 1,
    gap: 2,
  },
  pdpActionText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  pdpActionMeta: {
    fontSize: 12,
  },

  // Empty states
  emptyModule: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  emptyModuleLabel: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },

});
