import { useTheme } from '@/theme';
import { formatDate } from '@/utils/formatDate';
import { getPdpGoalStatusDisplay } from '@/utils/pdpGoalStatus';
import { PdpGoalStatus, type PdpGoal } from '@acme/shared';
import { Feather, Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { StatusPill } from '../StatusPill';

interface SamplePdpGoalCardProps {
  goal: PdpGoal;
}

/**
 * Read-only PDP goal card for the sample entry. A deliberate visual copy of the
 * finished-entry goal card in `app/(entry)/[artefactId].tsx` (the "PDP Goals"
 * section) — markup and style values match it, so restyle both together.
 *
 * Omits that card's completed/archived handling: the sample goal is always an
 * adopted (STARTED) goal. A ticked action means "tracked", as on real entries.
 */
export function SamplePdpGoalCard({ goal }: SamplePdpGoalCardProps) {
  const { colors } = useTheme();
  const status = getPdpGoalStatusDisplay(goal.status);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{goal.goal}</Text>
        <StatusPill label={status.label} variant={status.variant} />
      </View>

      {goal.reviewDate && (
        <View style={styles.reviewDateRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.reviewDateText, { color: colors.textSecondary }]}>
            Review by {formatDate(goal.reviewDate)}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        {goal.actions.map((action, index) => {
          const tracked =
            action.status === PdpGoalStatus.STARTED || action.status === PdpGoalStatus.COMPLETED;

          return (
            <View
              key={action.id}
              style={[styles.row, index === goal.actions.length - 1 && styles.rowLast]}
            >
              <View
                style={[
                  styles.checkbox,
                  tracked
                    ? { borderColor: colors.primary, backgroundColor: colors.primary }
                    : { borderColor: colors.textSecondary, backgroundColor: 'transparent' },
                ]}
              >
                {tracked && <Feather name="check" size={14} color="#ffffff" />}
              </View>
              <Text style={[styles.actionText, { color: colors.text }]}>{action.action}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Values mirror the pdp* styles in app/(entry)/[artefactId].tsx.
const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  reviewDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  reviewDateText: {
    fontSize: 13,
  },
  actions: {
    marginTop: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  actionText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
    flexShrink: 1,
  },
});
