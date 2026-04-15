import type { StatusVariant } from '@/components';
import { Button, CoverageRing, StatusPill } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  archiveReviewPeriod,
  fetchCoverage,
  fetchReviewPeriods,
  markDashboardStale,
  selectReviewPeriodById,
} from '@/store';
import { useTheme } from '@/theme';
import { ReviewPeriodStatus, type CoverageResponse, type DomainCoverage } from '@acme/shared';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Pressable,
  ScrollView,
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

function getStatusDisplay(status: ReviewPeriodStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case ReviewPeriodStatus.ACTIVE:
      return { label: 'Active', variant: 'success' };
    case ReviewPeriodStatus.ARCHIVED:
      return { label: 'Archived', variant: 'default' };
    default:
      return { label: 'Unknown', variant: 'default' };
  }
}

// ── Domain Section ───────────────────────────────────────────────────────────

function DomainSection({ domain }: { domain: DomainCoverage }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(true);

  const handleToggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  return (
    <View style={styles.domainContainer}>
      <TouchableOpacity
        style={styles.domainHeader}
        onPress={handleToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${domain.name}, ${domain.coveredCount} of ${domain.totalCount} covered`}
      >
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={colors.textSecondary}
        />
        <Text style={[styles.domainName, { color: colors.text }]}>{domain.name}</Text>
        <Text style={[styles.domainProgress, { color: colors.textSecondary }]}>
          {domain.coveredCount}/{domain.totalCount}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.capabilitiesList, { backgroundColor: colors.surface }]}>
          {domain.capabilities.map((cap, index) => {
            const isCovered = cap.status === 'covered';
            const isLast = index === domain.capabilities.length - 1;

            return (
              <View
                key={cap.code}
                style={[
                  styles.capabilityRow,
                  !isLast && styles.capabilityRowBorder,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Ionicons
                  name={isCovered ? 'checkmark-circle' : 'close-circle-outline'}
                  size={20}
                  color={isCovered ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.capabilityName,
                    { color: isCovered ? colors.text : colors.textSecondary },
                  ]}
                  numberOfLines={2}
                >
                  {cap.name}
                </Text>
                {isCovered && cap.entryCount > 0 && (
                  <View
                    style={[styles.entryCountBadge, { backgroundColor: colors.primary + '20' }]}
                  >
                    <Text style={[styles.entryCountText, { color: colors.primary }]}>
                      {cap.entryCount}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Detail Screen ────────────────────────────────────────────────────────────

export default function ReviewPeriodDetailScreen() {
  const { xid } = useLocalSearchParams<{ xid: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const navigation = useNavigation();
  const { showActionSheetWithOptions } = useActionSheet();

  const period = useAppSelector((state) => (xid ? selectReviewPeriodById(state, xid) : undefined));
  const coverage: CoverageResponse | undefined = useAppSelector((state) =>
    xid ? state.reviewPeriods.coverageByXid[xid] : undefined
  );
  const coverageLoading = useAppSelector((state) => state.reviewPeriods.coverageLoading);
  const mutating = useAppSelector((state) => state.reviewPeriods.mutating);

  useEffect(() => {
    if (xid) {
      dispatch(fetchCoverage(xid));
      dispatch(fetchReviewPeriods());
    }
  }, [xid, dispatch]);

  // Update header title with period name
  useEffect(() => {
    if (period) {
      navigation.setOptions({ title: period.name });
    }
  }, [period?.name, navigation]);

  const isActive = period?.status === ReviewPeriodStatus.ACTIVE;

  const handleArchive = useCallback(() => {
    if (!xid) return;
    Alert.alert(
      'Archive review period',
      'Are you sure you want to archive this review period? You can create a new one later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            await dispatch(archiveReviewPeriod(xid));
            dispatch(markDashboardStale());
            dispatch(fetchReviewPeriods());
            router.back();
          },
        },
      ]
    );
  }, [xid, dispatch, router]);

  const handleEdit = useCallback(() => {
    if (!xid) return;
    router.push(`/(review-period)/create?xid=${xid}`);
  }, [xid, router]);

  const handleShowMenu = useCallback(() => {
    const options = isActive
      ? ['Edit review period', 'Archive review period', 'Cancel']
      : ['Cancel'];
    const destructiveButtonIndex = isActive ? 1 : undefined;
    const cancelButtonIndex = isActive ? 2 : 0;

    showActionSheetWithOptions({ options, destructiveButtonIndex, cancelButtonIndex }, (index) => {
      if (!isActive) return;
      if (index === 0) handleEdit();
      if (index === 1) handleArchive();
    });
  }, [isActive, showActionSheetWithOptions, handleEdit, handleArchive]);

  // Set header right button
  useEffect(() => {
    if (!period) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={handleShowMenu} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [period?.status, navigation, colors.text, handleShowMenu]);

  if (!period || (coverageLoading && !coverage)) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statusDisplay = getStatusDisplay(period.status);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      {/* Coverage Ring Header */}
      {coverage && (
        <View style={styles.coverageHeader}>
          <CoverageRing
            percent={coverage.summary.coveragePercent}
            label={`${coverage.summary.coveredCount} of ${coverage.summary.totalCapabilities} covered`}
            size={120}
            strokeWidth={10}
          />
        </View>
      )}

      {/* Period Info */}
      <View style={styles.section}>
        <View style={styles.metaRow}>
          <StatusPill label={statusDisplay.label} variant={statusDisplay.variant} />
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
              {formatDate(period.startDate)} — {formatDate(period.endDate)}
            </Text>
          </View>
        </View>
      </View>

      {/* Domain Sections */}
      {coverage && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Coverage by domain</Text>
          {coverage.domains.map((domain) => (
            <DomainSection key={domain.code} domain={domain} />
          ))}
        </View>
      )}

      {/* Archive Button */}
      {isActive && (
        <View style={styles.section}>
          <Button
            label="Archive review period"
            variant="outline"
            onPress={handleArchive}
            loading={mutating}
            icon={(color) => <Ionicons name="archive-outline" size={18} color={color} />}
          />
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverageHeader: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 13,
  },

  // Domain sections
  domainContainer: {
    gap: 6,
  },
  domainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  domainName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  domainProgress: {
    fontSize: 14,
    fontWeight: '500',
  },
  capabilitiesList: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  capabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  capabilityRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  capabilityName: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  entryCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  entryCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
