import { CoverageRing, HomeSkeleton, SectionHeader, StatusPill, WelcomeModule } from '@/components';
import { GuestLimitBanner } from '@/components/GuestLimitBanner';
import { NoticeBanner } from '@/components/NoticeBanner';
import { useAppDispatch, useAppSelector, useCanCreateArtefact } from '@/hooks';
import { useNetworkRecovery } from '@/hooks/useNetworkRecovery';
import { useOfflineAwareInsets } from '@/hooks/useOfflineAwareInsets';
import {
  fetchInit,
  selectPdpGoalsDueSoon,
  selectPdpGoalsDueTotal,
  selectRecentEntries,
  selectRecentEntriesTotal,
} from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import { formatTimeAgo } from '@/utils/formatTimeAgo';
import {
  ArtefactStatus,
  type ActiveReviewPeriodSummary,
  type Artefact,
  type PdpGoal,
} from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ─── Module A: Start New Entry ────────────────────────────────────────────────

// Fixed primary CTA — a stable, predictable action (no rotation). The rotating
// helper line below it carries the varied, conversational sub-prompts.
const PRIMARY_CTA = 'Talk about your case';

// Rotating sub-prompts under the fixed CTA (MOB-026). Kept mode-neutral (no
// "mic" — the mic lives on the composer, MOB-124) so they fit voice or text.
const HELPERS = [
  // Ease / low-friction
  'Just talk it through — we do the rest.',
  'No forms, just describe what happened.',
  'A few sentences is enough to start.',
  // Value / outcome
  'Five minutes now, evidence forever.',
  'We shape your words into a write-up.',
  'Turn a quick note into portfolio evidence.',
  // Time-saving
  'A quick note now saves time later.',
  'Capture it now, while it’s fresh.',
  // Mode
  'Voice or text — your choice.',
  // Gentle nudges
  'Had a tricky consultation lately?',
  'Something you handled well today?',
  'A case that made you think?',
];

function StartNewEntryCard({
  onPress,
  helper,
  disabled = false,
}: {
  onPress: () => void;
  helper: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  // Disabled prompt is kept short so it never truncates in the single-row layout;
  // the action ("Tap to upgrade your account") lives in the helper line below.
  const displayPrompt = disabled ? 'Guest limit reached' : PRIMARY_CTA;
  const displayHelper = disabled ? 'Tap to upgrade your account' : helper;

  return (
    <TouchableOpacity
      style={[
        styles.captureCard,
        // Dark surface card with a subtle border. The button-ness comes from the
        // solid mint icon chip + green chevron, not a filled background — which
        // also lets the title/helper sit on dark (white text passes WCAG easily).
        { backgroundColor: colors.surface, borderColor: colors.border },
        disabled && styles.captureCardDisabled,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={disabled ? 'Upgrade to start new cases' : 'Talk about your case'}
      accessibilityState={{ disabled }}
    >
      {/* Rounded-square mint chip with a white glyph — the primary-color accent
          that signals "action" against the neutral card. */}
      <View style={[styles.ctaIconChip, { backgroundColor: colors.primary }]}>
        <Ionicons name={disabled ? 'lock-closed' : 'chatbubbles'} size={26} color="#fff" />
      </View>
      <View style={styles.captureTextContent}>
        <Text style={[styles.capturePrompt, { color: colors.text }]} numberOfLines={1}>
          {displayPrompt}
        </Text>
        <Text style={[styles.captureHelper, { color: colors.textSecondary }]} numberOfLines={2}>
          {displayHelper}
        </Text>
      </View>
      {/* Trailing green chevron: a directional "go" signifier in the accent
          color. Hidden when disabled, where the leading lock carries the state. */}
      {!disabled && <Ionicons name="chevron-forward" size={22} color={colors.primary} />}
    </TouchableOpacity>
  );
}

// ─── Module B: Recent Cases ───────────────────────────────────────────────────

// Number of recent cases shown before "See all". Kept small so the section stays
// compact alongside the PDP-goals module below it.
const RECENT_LIMIT = 3;

function RecentCaseRow({ item, onPress }: { item: Artefact; onPress: () => void }) {
  const { colors } = useTheme();
  const { label, variant } = getArtefactStatusDisplay(item.status);

  return (
    <TouchableOpacity
      style={[styles.recentRow, { backgroundColor: colors.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Open case: ${item.title || 'Untitled case'}`}
    >
      <View style={styles.recentRowText}>
        {/* Single-line title (truncates); meta sits directly under it. */}
        <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title || 'Untitled case'}
        </Text>
        <View style={styles.recentMetaRow}>
          <StatusPill label={label} variant={variant} compact />
          <Text style={[styles.recentMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {formatTimeAgo(item.updatedAt)}
          </Text>
        </View>
      </View>
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
        <SectionHeader title="Recent cases" />
        <View style={styles.emptyModuleContainer}>
          <Text style={styles.emptyModuleText}>
            No cases yet. After your next clinic, talk it through and we’ll turn it into portfolio
            evidence.
          </Text>
        </View>
      </View>
    );
  }

  // Only offer "See all" when there are more cases than we show inline —
  // otherwise it's a no-op detour to the same rows (the Entries tab still exists).
  const hasMore = total > RECENT_LIMIT;

  return (
    <View style={styles.moduleContainer}>
      <SectionHeader
        title="Recent cases"
        actionLabel={hasMore ? 'See all' : undefined}
        onAction={hasMore ? onSeeAll : undefined}
      />
      <View style={styles.recentList}>
        {items.slice(0, RECENT_LIMIT).map((item) => (
          <RecentCaseRow key={item.id} item={item} onPress={() => onEntryPress(item)} />
        ))}
      </View>
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
            <View style={styles.pdpActionContent}>
              <Text style={[styles.pdpActionText, { color: colors.text }]} numberOfLines={1}>
                {goal.goal}
              </Text>
              <View style={styles.pdpActionMetaRow}>
                <Text style={[styles.pdpActionMeta, { color: colors.textSecondary }]}>
                  {goal.actions.length} action{goal.actions.length !== 1 ? 's' : ''}
                </Text>
                {dueInfo && (
                  <>
                    <View style={[styles.statDot, { backgroundColor: colors.textSecondary }]} />
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
}: {
  data: ActiveReviewPeriodSummary | null;
  onPress: () => void;
  onSetup: () => void;
}) {
  const { colors } = useTheme();

  if (!data) {
    return (
      <View style={styles.moduleContainer}>
        {/* No section header: the card is self-describing ("Track your ARCP
            coverage"), so a "Review period" label above it would double up. */}
        <TouchableOpacity
          style={[
            styles.coverageEmptyCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={onSetup}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Set up a review period"
        >
          {/* Same rounded-square mint chip as the CTA, so the two cards read as
              siblings. */}
          <View style={[styles.ctaIconChip, { backgroundColor: colors.primary }]}>
            <Ionicons name="calendar-outline" size={26} color="#fff" />
          </View>
          <View style={styles.coverageEmptyContent}>
            <Text style={[styles.coverageEmptyTitle, { color: colors.text }]}>
              Track your ARCP coverage
            </Text>
            <Text style={[styles.coverageEmptyDesc, { color: colors.textSecondary }]}>
              Set up a review period to see which capabilities your cases cover.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>
    );
  }

  const { period, coverage } = data;

  return (
    <View style={styles.moduleContainer}>
      {/* No section header: the coverage card is self-describing (period name +
          progress), so a "Review period" label above it would double up. */}
      <TouchableOpacity
        style={[
          styles.coverageCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Review period: ${period.name}, ${coverage.coveragePercent}% coverage`}
      >
        {/* Medium ring keeps the % (no separate %-text needed); the text block is
            two lines — name, then count + deadline. Start date is deferred to the
            detail screen. */}
        <CoverageRing percent={coverage.coveragePercent} size={52} />
        <View style={styles.coverageCardContent}>
          <Text style={[styles.coverageCardName, { color: colors.text }]} numberOfLines={1}>
            {period.name}
          </Text>
          <View style={styles.coverageStatRow}>
            <Text
              style={[styles.coverageCardStat, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {coverage.coveredCount} / {coverage.totalCapabilities} covered
            </Text>
            <View style={[styles.statDot, { backgroundColor: colors.textSecondary }]} />
            <Text
              style={[styles.coverageCardStat, { color: colors.textSecondary, flexShrink: 1 }]}
              numberOfLines={1}
            >
              ends {formatPeriodDate(period.endDate)}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
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

  const recentArtefacts = useAppSelector(selectRecentEntries);
  const recentEntriesTotal = useAppSelector(selectRecentEntriesTotal);
  const recentEntryIds = useAppSelector((state) => state.dashboard.recentEntryIds);
  const activeReviewPeriod = useAppSelector((state) => state.dashboard.activeReviewPeriod);
  const pdpGoalsDueSoon = useAppSelector(selectPdpGoalsDueSoon);
  const pdpGoalsDueTotal = useAppSelector(selectPdpGoalsDueTotal);
  const dashboardLoading = useAppSelector((state) => state.dashboard.status === 'loading');
  const dashboardError = useAppSelector((state) => state.dashboard.error);
  const dashboardStale = useAppSelector((state) => state.dashboard.stale);
  const user = useAppSelector((state) => state.auth.user);
  const isGuest = useAppSelector((state) => state.auth.status === 'guest');

  // Data-driven: show welcome when dashboard has no entries (new user or empty account)
  const hasEntries = recentArtefacts.length > 0;
  const showWelcome = !hasEntries && !dashboardLoading;

  const specialtyLabel = user?.specialty?.name ?? null;
  const stageLabel = user?.specialty?.trainingStage?.label ?? null;

  // True on first load when no data exists yet (null = never fetched, [] = fetched but empty)
  const isInitialLoad = dashboardLoading && recentEntryIds === null;

  const scrollContentStyle = useMemo(
    () => [styles.scrollContent, { paddingTop: 16, paddingBottom: insets.bottom + 24 }],
    [insets.bottom]
  );

  // Randomise the helper sub-line on each screen focus (not just mount). The
  // primary CTA is fixed (PRIMARY_CTA) and does not rotate.
  const [helper, setHelper] = useState(() => HELPERS[Math.floor(Math.random() * HELPERS.length)]);
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setHelper(HELPERS[Math.floor(Math.random() * HELPERS.length)]);
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

  // Refetch dashboard when connectivity returns, only if data is missing or errored
  useNetworkRecovery(
    useCallback(() => {
      if (!dashboardLoading && (recentEntryIds === null || dashboardError)) {
        dispatch(fetchInit());
      }
    }, [dispatch, dashboardLoading, recentEntryIds, dashboardError])
  );

  const { canCreate, guard } = useCanCreateArtefact();

  const handleStartNew = useCallback(() => {
    if (!guard()) return;
    const newConversationId = randomUUID();
    router.push(`/(messages)/${newConversationId}?isNew=true`);
  }, [guard, router]);

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
    const xid = activeReviewPeriod?.period.id;
    if (xid) router.push(`/(review-period)/${xid}`);
  }, [router, activeReviewPeriod?.period.id]);

  const handleSetupReviewPeriod = useCallback(() => {
    router.push('/(review-period)/create');
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
          <Text style={[styles.title, { color: colors.text }]}>{isGuest ? 'Home' : 'Welcome'}</Text>
        </View>

        <NoticeBanner />
        <GuestLimitBanner />

        {/* Review Period Coverage — placed first as a dashboard-style summary of
            ARCP capability coverage. Returning, loaded users only (the welcome and
            skeleton states render their own content instead). */}
        {!showWelcome && !isInitialLoad && (
          <ReviewPeriodCoverageModule
            data={activeReviewPeriod ?? null}
            onPress={handleReviewPeriodPress}
            onSetup={handleSetupReviewPeriod}
          />
        )}

        {/* Module A: Start New Entry — hidden in the welcome (first-run) state,
            where the WelcomeModule provides the single "Record your first entry"
            CTA. Shown for returning users and during the initial-load skeleton. */}
        {showWelcome ? null : (
          <StartNewEntryCard onPress={handleStartNew} helper={helper} disabled={!canCreate} />
        )}

        {/* First-run: welcome explainer only. Returning: full dashboard modules. */}
        {showWelcome ? (
          <WelcomeModule
            specialtyLabel={specialtyLabel}
            stageLabel={stageLabel}
            onStartFirstEntry={handleStartNew}
          />
        ) : isInitialLoad ? (
          <HomeSkeleton />
        ) : (
          <>
            {/* Modules C+D: combined empty card when both are empty, individual modules otherwise */}
            {recentArtefacts.length === 0 && pdpGoalsDueSoon.length === 0 ? (
              <View style={styles.moduleContainer}>
                <View style={[styles.combinedEmptyCard, { backgroundColor: colors.surface }]}>
                  <Ionicons name="layers-outline" size={24} color={colors.textSecondary} />
                  <Text style={[styles.combinedEmptyText, { color: colors.textSecondary }]}>
                    Your cases and PDP goals will appear here.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <RecentEntriesModule
                  items={recentArtefacts}
                  total={recentEntriesTotal}
                  onEntryPress={handleEntryPress}
                  onSeeAll={handleSeeAllEntries}
                />
                <PdpDueSoonModule
                  items={pdpGoalsDueSoon}
                  total={pdpGoalsDueTotal}
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
  // Header
  header: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },

  // Module A: Start New Entry
  captureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    // marginTop matches the modules' marginTop so the gap above the CTA (8px
    // scroll gap + 8px) equals the screen's section rhythm (~16px).
    marginTop: 8,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  captureCardDisabled: {
    opacity: 0.6,
  },
  capturePrompt: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  captureTextContent: {
    flex: 1,
    gap: 2,
  },
  ctaIconChip: {
    width: 52,
    height: 52,
    // Rounded square (squircle), not a circle — matches the icon-chip layout.
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureHelper: {
    fontSize: 14,
    lineHeight: 19,
    // Always reserve two lines (2 × lineHeight) so the card height stays fixed as
    // the rotating HELPERS cycle between 1- and 2-line strings. numberOfLines={2}
    // caps the max; this reserves the min so short prompts don't shrink the card.
    minHeight: 38,
  },

  // Module B: Recent Entries
  moduleContainer: {
    marginTop: 8,
  },
  recentList: {
    paddingHorizontal: 20,
    gap: 8,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  recentRowText: {
    flex: 1,
    gap: 6,
  },
  recentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  recentMeta: {
    fontSize: 12,
    lineHeight: 16,
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
    gap: 6,
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

  // Review Period Coverage — shares the CTA's card shell (surface + 1px border,
  // radius 18, padding 16, gap 14, 52px leading chip) so the two read as siblings.
  coverageEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
  },
  coverageEmptyContent: {
    flex: 1,
    gap: 2,
  },
  coverageEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  coverageEmptyDesc: {
    fontSize: 14,
    lineHeight: 19,
  },
  coverageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
  },
  coverageCardContent: {
    flex: 1,
    gap: 2,
  },
  coverageCardName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  coverageCardStat: {
    fontSize: 13,
    lineHeight: 18,
  },
  coverageStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // A real round separator dot — vertically centred by the row's alignItems,
  // avoiding the baseline offset of an enlarged inline "•" glyph.
  statDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
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
