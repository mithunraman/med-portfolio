import { CoverageRing, SectionHeader, StatusPill } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { useNetworkRecovery } from '@/hooks/useNetworkRecovery';
import { useOfflineAwareInsets } from '@/hooks/useOfflineAwareInsets';
import { clearNewRegistration, fetchInit } from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import {
  ArtefactStatus,
  type ActiveReviewPeriodSummary,
  type Artefact,
  type PdpGoal,
} from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

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

// ─── Welcome Module (first-run only) ─────────────────────────────────────────

const HOW_IT_WORKS = [
  { step: '1', text: 'Talk about your clinical experience' },
  { step: '2', text: 'We structure it into a portfolio entry' },
  { step: '3', text: 'Track your curriculum coverage over time' },
];

function WelcomeModule({
  specialtyLabel,
  stageLabel,
}: {
  specialtyLabel: string | null;
  stageLabel: string | null;
}) {
  const { colors } = useTheme();
  const setupLine =
    specialtyLabel && stageLabel ? `You're set up for ${specialtyLabel}, ${stageLabel}.` : null;

  return (
    <View style={styles.welcomeContainer}>
      <Text style={[styles.welcomeHeading, { color: colors.text }]}>Here's how it works</Text>
      {setupLine && (
        <Text style={[styles.welcomeSetup, { color: colors.textSecondary }]}>{setupLine}</Text>
      )}
      <View style={styles.welcomeSteps}>
        {HOW_IT_WORKS.map((item) => (
          <View key={item.step} style={styles.welcomeStepRow}>
            <View style={[styles.welcomeStepCircle, { backgroundColor: colors.primary + '1F' }]}>
              <Text style={[styles.welcomeStepNumber, { color: colors.primary }]}>{item.step}</Text>
            </View>
            <Text style={[styles.welcomeStepText, { color: colors.text }]}>{item.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
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
  prompt,
}: {
  onPress: () => void;
  lastEntryDate?: string;
  prompt: string;
}) {
  const { colors } = useTheme();
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
          Just talk about your case - we'll handle the rest.
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
        snapToInterval={152}
        decelerationRate="fast"
        renderItem={({ item }) => (
          <RecentEntryCard item={item} onPress={() => onEntryPress(item)} />
        )}
      />
    </View>
  );
}

// ─── Module C: PDP Goals Due Soon ─────────────────────────────────────────────

const WARNING_COLOR = '#f59e0b';

function getNextDueDate(
  goal: PdpGoal
): { label: string; isOverdue: boolean; timestamp: number } | null {
  const now = Date.now();

  // Collect all due dates: goal reviewDate + action dueDates
  const dates: Date[] = [];
  if (goal.reviewDate) dates.push(new Date(goal.reviewDate));
  for (const action of goal.actions) {
    if (action.dueDate) dates.push(new Date(action.dueDate));
  }

  if (dates.length === 0) return null;

  // Find the nearest future date, or the most recent past date if all overdue
  dates.sort((a, b) => a.getTime() - b.getTime());
  const nearest = dates.find((d) => d.getTime() > now) ?? dates[dates.length - 1];
  const isOverdue = nearest.getTime() < now;

  const diffDays = Math.ceil((nearest.getTime() - now) / 86400000);
  let label: string;
  if (isOverdue) {
    label = 'Overdue';
  } else if (diffDays === 0) {
    label = 'Due today';
  } else if (diffDays === 1) {
    label = 'Due tomorrow';
  } else if (diffDays <= 7) {
    label = `Due in ${diffDays}d`;
  } else {
    label = `Due ${nearest.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  }

  return { label, isOverdue, timestamp: nearest.getTime() };
}

function PdpDueSoonModule({
  items,
  total,
  onGoalPress,
}: {
  items: PdpGoal[];
  total: number;
  onGoalPress: (goal: PdpGoal) => void;
}) {
  const { colors } = useTheme();

  // Sort by nearest due date (overdue first, then soonest upcoming)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aDue = getNextDueDate(a);
      const bDue = getNextDueDate(b);
      // Goals without dates go last
      if (!aDue && !bDue) return 0;
      if (!aDue) return 1;
      if (!bDue) return -1;
      return aDue.timestamp - bDue.timestamp;
    });
  }, [items]);

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
      {sortedItems.map((goal) => {
        const dueInfo = getNextDueDate(goal);

        return (
          <TouchableOpacity
            key={goal.id}
            style={[styles.pdpActionCard, { backgroundColor: colors.surface }]}
            onPress={() => onGoalPress(goal)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`PDP goal: ${goal.goal}`}
          >
            <Ionicons name="flag-outline" size={18} color={colors.primary} />
            <View style={styles.pdpActionContent}>
              <Text style={[styles.pdpActionText, { color: colors.text }]} numberOfLines={2}>
                {goal.goal}
              </Text>
              <View style={styles.pdpActionMetaRow}>
                <Text style={[styles.pdpActionMeta, { color: colors.textSecondary }]}>
                  {goal.actions.length} action{goal.actions.length !== 1 ? 's' : ''}
                </Text>
                {dueInfo && (
                  <>
                    <Text style={[styles.pdpActionMetaDot, { color: colors.textSecondary }]}>
                      {' '}
                      ·{' '}
                    </Text>
                    <Text
                      style={[
                        styles.pdpActionMeta,
                        { color: dueInfo.isOverdue ? WARNING_COLOR : colors.textSecondary },
                      ]}
                    >
                      {dueInfo.label}
                    </Text>
                  </>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Module D: Review Period Coverage ────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPeriodDate(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function ReviewPeriodCoverageModule({
  data,
  onPress,
  onSetup,
  onSeeAll,
}: {
  data: ActiveReviewPeriodSummary | null;
  onPress: () => void;
  onSetup: () => void;
  onSeeAll: () => void;
}) {
  const { colors } = useTheme();

  if (!data) {
    return (
      <View style={styles.moduleContainer}>
        <SectionHeader title="Review period" />
        <TouchableOpacity
          style={[styles.coverageEmptyCard, { backgroundColor: colors.primary + '12' }]}
          onPress={onSetup}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Set up a review period"
        >
          <View style={[styles.coverageEmptyIcon, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="calendar-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.coverageEmptyContent}>
            <Text style={[styles.coverageEmptyTitle, { color: colors.text }]}>
              Track your ARCP coverage
            </Text>
            <Text style={[styles.coverageEmptyDesc, { color: colors.textSecondary }]}>
              Set up a review period to see which capabilities your entries cover.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>
    );
  }

  const { period, coverage } = data;

  return (
    <View style={styles.moduleContainer}>
      <SectionHeader title="Review period" actionLabel="See all" onAction={onSeeAll} />
      <TouchableOpacity
        style={[styles.coverageCard, { backgroundColor: colors.surface }]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Review period: ${period.name}, ${coverage.coveragePercent}% coverage`}
      >
        <CoverageRing percent={coverage.coveragePercent} />
        <View style={styles.coverageCardContent}>
          <Text style={[styles.coverageCardName, { color: colors.text }]} numberOfLines={1}>
            {period.name}
          </Text>
          <Text style={[styles.coverageCardStat, { color: colors.textSecondary }]}>
            {coverage.coveredCount} of {coverage.totalCapabilities} capabilities covered
          </Text>
          <Text style={[styles.coverageCardDates, { color: colors.textSecondary }]}>
            {formatPeriodDate(period.startDate)} — {formatPeriodDate(period.endDate)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useOfflineAwareInsets();
  const router = useRouter();
  const { colors } = useTheme();

  const dispatch = useAppDispatch();

  const dashboardData = useAppSelector((state) => state.dashboard.data);
  const dashboardLoading = useAppSelector((state) => state.dashboard.loading);
  const dashboardError = useAppSelector((state) => state.dashboard.error);
  const dashboardStale = useAppSelector((state) => state.dashboard.stale);
  const isNewRegistration = useAppSelector((state) => state.auth.isNewRegistration);
  const user = useAppSelector((state) => state.auth.user);
  // Capture on mount so it survives clearNewRegistration() in the useEffect below
  const [isFirstRun] = useState(() => isNewRegistration);

  const specialtyLabel = user?.specialty?.name ?? null;
  const stageLabel = user?.specialty?.trainingStage?.label ?? null;

  // True on first load when no data exists yet (not on subsequent refreshes)
  const isInitialLoad = dashboardLoading && !dashboardData;

  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, { paddingTop: 16, paddingBottom: insets.bottom + 24 }],
    [insets.bottom]
  );

  // Randomise prompt on each screen focus (not just mount)
  const [prompt, setPrompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setPrompt(PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
      if (dashboardStale) {
        dispatch(fetchInit());
      }
    }, [dashboardStale, dispatch])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await dispatch(fetchInit()).unwrap();
    } catch {
      // Error handled by slice
    } finally {
      setRefreshing(false);
    }
  }, [dispatch]);

  useEffect(() => {
    if (isNewRegistration) {
      // New guest has no data — skip the fetch, show empty states immediately.
      // Clear the flag so subsequent visits (after creating entries) will fetch.
      dispatch(clearNewRegistration());
      return;
    }
    dispatch(fetchInit());
  }, [dispatch, isNewRegistration]);

  // Refetch dashboard when connectivity returns, only if data is missing or errored
  useNetworkRecovery(
    useCallback(() => {
      if (!dashboardLoading && (!dashboardData || dashboardError)) {
        dispatch(fetchInit());
      }
    }, [dispatch, dashboardLoading, dashboardData, dashboardError])
  );

  const handleStartNew = useCallback(() => {
    const newConversationId = randomUUID();
    router.push(`/(messages)/${newConversationId}?isNew=true`);
  }, [router]);

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

  const handleSeeAllEntries = useCallback(() => {
    router.push('/(tabs)/entries');
  }, [router]);

  const handleGoalPress = useCallback(
    (goal: PdpGoal) => {
      router.push(`/(pdp-goal)/${goal.id}`);
    },
    [router]
  );

  const handleReviewPeriodPress = useCallback(() => {
    const xid = dashboardData?.activeReviewPeriod?.period.id;
    if (xid) router.push(`/(review-period)/${xid}`);
  }, [router, dashboardData?.activeReviewPeriod?.period.id]);

  const handleSetupReviewPeriod = useCallback(() => {
    router.push('/(review-period)/create');
  }, [router]);

  const handleSeeAllReviewPeriods = useCallback(() => {
    router.push('/(review-period)/list');
  }, [router]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={scrollContentStyle}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            {isFirstRun ? 'Welcome to your portfolio' : 'Home'}
          </Text>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate()}</Text>
        </View>

        {/* Module A: Start New Entry */}
        <StartNewEntryCard
          onPress={handleStartNew}
          lastEntryDate={dashboardData?.recentEntries.items[0]?.updatedAt}
          prompt={prompt}
        />

        {/* First-run: welcome explainer only. Returning: full dashboard modules. */}
        {isFirstRun ? (
          <WelcomeModule specialtyLabel={specialtyLabel} stageLabel={stageLabel} />
        ) : isInitialLoad ? (
          <View style={styles.initialLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Module B: Review Period Coverage (high priority — ARCP tracking) */}
            <ReviewPeriodCoverageModule
              data={dashboardData?.activeReviewPeriod ?? null}
              onPress={handleReviewPeriodPress}
              onSetup={handleSetupReviewPeriod}
              onSeeAll={handleSeeAllReviewPeriods}
            />

            {/* Modules C+D: combined empty card when both are empty, individual modules otherwise */}
            {(dashboardData?.recentEntries.items.length ?? 0) === 0 &&
            (dashboardData?.pdpGoalsDue.items.length ?? 0) === 0 ? (
              <View style={styles.moduleContainer}>
                <View style={[styles.combinedEmptyCard, { backgroundColor: colors.surface }]}>
                  <Ionicons name="layers-outline" size={24} color={colors.textSecondary} />
                  <Text style={[styles.combinedEmptyText, { color: colors.textSecondary }]}>
                    Your entries and PDP goals will appear here.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <RecentEntriesModule
                  items={dashboardData?.recentEntries.items ?? []}
                  total={dashboardData?.recentEntries.total ?? 0}
                  onEntryPress={handleEntryPress}
                  onSeeAll={handleSeeAllEntries}
                />
                <PdpDueSoonModule
                  items={dashboardData?.pdpGoalsDue.items ?? []}
                  total={dashboardData?.pdpGoalsDue.total ?? 0}
                  onGoalPress={handleGoalPress}
                />
              </>
            )}
          </>
        )}
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
  initialLoading: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 140,
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
  pdpActionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  pdpActionMeta: {
    fontSize: 12,
  },
  pdpActionMetaDot: {
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

  // Review Period Coverage
  coverageEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  coverageEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverageEmptyContent: {
    flex: 1,
    gap: 2,
  },
  coverageEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  coverageEmptyDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  coverageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  coverageCardContent: {
    flex: 1,
    gap: 2,
  },
  coverageCardName: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  coverageCardStat: {
    fontSize: 13,
    lineHeight: 18,
  },
  coverageCardDates: {
    fontSize: 12,
    lineHeight: 16,
  },

  // Welcome Module (first-run)
  welcomeContainer: {
    marginHorizontal: 20,
    marginTop: 12,
    gap: 8,
  },
  welcomeHeading: {
    fontSize: 17,
    fontWeight: '600',
  },
  welcomeSetup: {
    fontSize: 14,
    lineHeight: 20,
  },
  welcomeSteps: {
    marginTop: 4,
    gap: 12,
  },
  welcomeStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  welcomeStepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeStepNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  welcomeStepText: {
    fontSize: 15,
    lineHeight: 20,
    flex: 1,
  },

  // Combined empty state (entries + PDP goals both empty)
  combinedEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  combinedEmptyText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
