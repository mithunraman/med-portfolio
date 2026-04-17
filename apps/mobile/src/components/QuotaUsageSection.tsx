import { useAppSelector } from '@/hooks';
import { useTheme } from '@/theme';
import type { QuotaWindow } from '@acme/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

function formatTimeRemaining(resetsAt: string | null): string {
  if (!resetsAt) return 'Rolling window';

  const diff = new Date(resetsAt).getTime() - Date.now();
  if (diff <= 0) return 'Resetting...';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Resets in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `Resets in ${hours}h ${minutes}m`;
  return `Resets in ${minutes}m`;
}

function getBarColor(percent: number, colors: { primary: string; error: string }): string {
  if (percent >= 90) return colors.error;
  if (percent >= 60) return '#f59e0b';
  return colors.primary;
}

function QuotaBar({ label, window: w }: { label: string; window: QuotaWindow }) {
  const { colors } = useTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const percent = w.limit > 0 ? Math.min((w.used / w.limit) * 100, 100) : 0;
  const barColor = getBarColor(percent, colors);
  const resetLabel =
    w.windowType === 'rolling'
      ? w.resetsAt
        ? formatTimeRemaining(w.resetsAt)
        : 'Rolling 4h window'
      : formatTimeRemaining(w.resetsAt);

  return (
    <View style={styles.quotaRow}>
      <View style={styles.quotaHeader}>
        <Text style={[styles.quotaLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.quotaPercent, { color: barColor }]}>{Math.round(percent)}% used</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.quotaMeta, { color: colors.textSecondary }]}>{resetLabel}</Text>
    </View>
  );
}

export function QuotaUsageSection() {
  const quota = useAppSelector((s) => s.auth.quota);
  const { colors } = useTheme();
  const router = useRouter();

  if (!quota) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>AI Credits</Text>
        <TouchableOpacity
          style={styles.infoLink}
          onPress={() => router.push('/credits-info')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="How do credits work?"
        >
          <Text style={[styles.infoLinkText, { color: colors.primary }]}>How do credits work?</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.sectionContent, { backgroundColor: colors.surface }]}>
        <QuotaBar label="Session credits" window={quota.shortWindow} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <QuotaBar label="Weekly credits" window={quota.weeklyWindow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  quotaRow: {
    gap: 6,
  },
  quotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quotaLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  quotaPercent: {
    fontSize: 14,
    fontWeight: '700',
  },
  barTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  quotaMeta: {
    fontSize: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  infoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  infoLinkText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
