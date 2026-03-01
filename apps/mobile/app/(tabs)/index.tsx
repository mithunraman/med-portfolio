import { SectionHeader, StatusPill } from '@/components';
import { useAppDispatch, useAppSelector, useAuth } from '@/hooks';
import { fetchArtefacts, selectAllArtefacts } from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import type { Artefact } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
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

function StartNewEntryCard({ onVoice, onText }: { onVoice: () => void; onText: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>What did you learn today?</Text>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        onPress={onVoice}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Start voice conversation"
      >
        <Ionicons name="mic" size={20} color="#fff" />
        <Text style={styles.primaryButtonText}>Talk about it</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryButton, { borderColor: colors.border }]}
        onPress={onText}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Start text conversation"
      >
        <Ionicons name="create-outline" size={18} color={colors.text} />
        <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Write instead</Text>
      </TouchableOpacity>

      <Text style={[styles.helperText, { color: colors.textSecondary }]}>
        30–90 seconds is enough. You can refine it later.
      </Text>
    </View>
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
  artefacts,
  onEntryPress,
  onSeeAll,
}: {
  artefacts: Artefact[];
  onEntryPress: (item: Artefact) => void;
  onSeeAll: () => void;
}) {
  if (artefacts.length === 0) {
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
      <SectionHeader title="Recent entries" actionLabel="See all" onAction={onSeeAll} />
      <FlatList
        horizontal
        data={artefacts.slice(0, 5)}
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

// ─── Module C: PDP Actions Due Soon ───────────────────────────────────────────

function PdpDueSoonModule() {
  const { colors } = useTheme();

  return (
    <View style={styles.moduleContainer}>
      <SectionHeader title="PDP actions due soon" />
      <View style={[styles.emptyModule, { backgroundColor: colors.surface }]}>
        <Ionicons name="checkbox-outline" size={24} color={colors.textSecondary} />
        <Text style={[styles.emptyModuleLabel, { color: colors.textSecondary }]}>
          No actions due in the next 14 days.
        </Text>
      </View>
    </View>
  );
}

// ─── Module D: Progress Snapshot ──────────────────────────────────────────────

function ProgressSnapshotModule() {
  const { colors } = useTheme();

  return (
    <View style={styles.moduleContainer}>
      <SectionHeader title="Progress" />
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.text }]}>--</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>This week</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.text }]}>--</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>To review</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statNumber, { color: colors.text }]}>--</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Capabilities</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();
  const dispatch = useAppDispatch();

  const artefacts = useAppSelector(selectAllArtefacts);

  useEffect(() => {
    dispatch(fetchArtefacts());
  }, [dispatch]);

  const handleStartNew = useCallback(() => {
    const newConversationId = randomUUID();
    router.push(`/(messages)/${newConversationId}?isNew=true`);
  }, [router]);

  const handleEntryPress = useCallback(
    (item: Artefact) => {
      router.push(`/(messages)/${item.conversation.id}`);
    },
    [router]
  );

  const handleSeeAllEntries = useCallback(() => {
    router.push('/(tabs)/entries');
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.appTitle, { color: colors.text }]}>Portfolio</Text>
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate()}</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={[styles.avatarButton, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Go to profile"
          >
            <Text style={styles.avatarButtonText}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Module A: Start New Entry */}
        <StartNewEntryCard onVoice={handleStartNew} onText={handleStartNew} />

        {/* Module B: Recent Entries */}
        <RecentEntriesModule
          artefacts={artefacts}
          onEntryPress={handleEntryPress}
          onSeeAll={handleSeeAllEntries}
        />

        {/* Module C: PDP Actions Due Soon */}
        <PdpDueSoonModule />

        {/* Module D: Progress Snapshot */}
        <ProgressSnapshotModule />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  dateText: {
    fontSize: 14,
    marginTop: 2,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Module A: Start New Entry
  card: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
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

  // Module C & D: Empty states
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

  // Module D: Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
});
