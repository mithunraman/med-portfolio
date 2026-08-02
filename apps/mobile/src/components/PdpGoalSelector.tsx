import { useTheme } from '@/theme';
import { hexToRgba } from '@/utils/color';
import { formatDate } from '@/utils/formatDate';
import type { PdpGoal } from '@acme/shared';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ReviewDatePickerSheet } from './ReviewDatePickerSheet';

// ── Types ──

export interface GoalSelectionState {
  selected: boolean;
  reviewDate: Date | null;
  actions: Map<string, boolean>;
}

interface PdpGoalSelectorProps {
  goals: PdpGoal[];
  selections: Map<string, GoalSelectionState>;
  onToggleGoal: (goalId: string) => void;
  onToggleAction: (goalId: string, actionId: string) => void;
  onSetReviewDate: (goalId: string, date: Date | null) => void;
  disabled?: boolean;
}

// Single source of truth for the initial selection state (owned here alongside
// GoalSelectionState). Callers ask the component for defaults rather than
// re-implementing the shape.
export function initGoalSelections(goals: PdpGoal[]): Map<string, GoalSelectionState> {
  const map = new Map<string, GoalSelectionState>();
  for (const goal of goals) {
    map.set(goal.id, {
      // Opt-in default (MOB-078): untracked until the user taps "Track this goal".
      selected: false,
      reviewDate: null,
      actions: new Map(goal.actions.map((a) => [a.id, true])),
    });
  }
  return map;
}

// ── Main component ──

export function PdpGoalSelector({
  goals,
  selections,
  onToggleGoal,
  onToggleAction,
  onSetReviewDate,
  disabled = false,
}: PdpGoalSelectorProps) {
  const { colors } = useTheme();
  const [datePickerGoalId, setDatePickerGoalId] = useState<string | null>(null);

  const dismissDatePicker = useCallback(() => setDatePickerGoalId(null), []);

  const activeGoal = datePickerGoalId ? selections.get(datePickerGoalId) : null;

  return (
    <View style={styles.container}>
      {goals.map((goal) => {
        const sel = selections.get(goal.id);
        if (!sel) return null;

        // Untracked (opt-in default): a dashed "ghost" card that reads as
        // addable - full-opacity text + a Track affordance, the whole card
        // tappable for a large target. Deliberately NOT dimmed (that would read
        // as disabled).
        if (!sel.selected) {
          return (
            <Pressable
              key={goal.id}
              onPress={() => onToggleGoal(goal.id)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Track goal: ${goal.goal}`}
              style={[styles.goalCard, styles.ghostCard, { borderColor: colors.border }]}
            >
              <Text style={[styles.goalText, { color: colors.text }]}>{goal.goal}</Text>
              <View style={[styles.trackButton, { borderColor: colors.primary }]}>
                <Ionicons name="add" size={18} color={colors.primary} />
                <Text style={[styles.trackButtonText, { color: colors.primary }]}>
                  Track this goal
                </Text>
              </View>
            </Pressable>
          );
        }

        // Tracked: solid card that discloses the review date + actions, with a
        // tertiary Untrack at the foot. The date chip warns (amber) while unset -
        // it's required at finalise - and calms to primary once a date is chosen
        // (attention, not error: no red before the user tries to finalise).
        const hasDate = sel.reviewDate != null;
        const dateAccent = hasDate ? colors.primary : colors.warning;
        const dateBg = hasDate ? hexToRgba(colors.primary, 0.1) : colors.warningBackground;
        const dateBorder = hasDate ? hexToRgba(colors.primary, 0.2) : colors.warningBorder;
        return (
          <View
            key={goal.id}
            style={[
              styles.goalCard,
              { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
            ]}
          >
            {/* No leading badge: the solid border, disclosed content, and Untrack
                already signal "tracked", and omitting it keeps the title aligned
                with the untracked ghost card (no layout shift on toggle). */}
            <Text style={[styles.goalText, { color: colors.text }]}>{goal.goal}</Text>

            {/* Review date chip - disclosed on track; required at finalise */}
            <Pressable
              onPress={() => setDatePickerGoalId(goal.id)}
              disabled={disabled}
              style={[
                styles.dateRow,
                { backgroundColor: dateBg, borderColor: dateBorder, borderWidth: 1 },
              ]}
            >
              <Ionicons name="calendar-outline" size={18} color={dateAccent} />
              <Text style={[styles.dateText, { color: dateAccent }]}>
                {sel.reviewDate ? `Review by ${formatDate(sel.reviewDate)}` : 'Set review date'}
              </Text>
            </Pressable>

            {/* Actions label */}
            <Text style={[styles.actionsLabel, { color: colors.textSecondary }]}>Actions</Text>

            {/* Actions */}
            <View style={styles.actionsContainer}>
              {goal.actions.map((action, index) => {
                const isChecked = sel.actions.get(action.id) ?? true;
                return (
                  <Pressable
                    key={action.id}
                    onPress={() => onToggleAction(goal.id, action.id)}
                    disabled={disabled}
                    style={[
                      styles.actionRow,
                      index === goal.actions.length - 1 && styles.actionRowLast,
                    ]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: isChecked ? colors.primary : colors.textSecondary,
                          backgroundColor: isChecked ? colors.primary : 'transparent',
                        },
                      ]}
                    >
                      {isChecked && <Feather name="check" size={14} color="#ffffff" />}
                    </View>
                    <Text
                      style={[
                        styles.actionText,
                        { color: isChecked ? colors.text : colors.textSecondary },
                        !isChecked && styles.uncheckedActionText,
                      ]}
                    >
                      {action.action}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Untrack - tertiary, low-emphasis so it doesn't compete */}
            <Pressable
              onPress={() => onToggleGoal(goal.id)}
              disabled={disabled}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Untrack goal: ${goal.goal}`}
              style={styles.untrackButton}
            >
              <Text style={[styles.untrackText, { color: colors.textSecondary }]}>Untrack</Text>
            </Pressable>
          </View>
        );
      })}

      {/* Date picker bottom sheet - one shared instance */}
      <ReviewDatePickerSheet
        visible={datePickerGoalId !== null}
        currentDate={activeGoal?.reviewDate ?? null}
        onSelect={(date) => {
          if (datePickerGoalId) onSetReviewDate(datePickerGoalId, date);
        }}
        onClear={() => {
          if (datePickerGoalId) onSetReviewDate(datePickerGoalId, null);
        }}
        onDismiss={dismissDatePicker}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  goalCard: {
    borderRadius: 12,
    padding: 14,
  },
  // Untracked ghost card: dashed, addable, never dimmed-to-disabled.
  ghostCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    gap: 12,
    alignItems: 'flex-start',
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  trackButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  untrackButton: {
    alignSelf: 'flex-end',
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  untrackText: {
    fontSize: 13,
    fontWeight: '500',
  },
  goalText: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  dateText: {
    fontSize: 14,
  },
  actionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginLeft: 4,
  },
  actionsContainer: {
    marginTop: 6,
    marginLeft: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  actionRowLast: {
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
    paddingTop: 1,
  },
  uncheckedActionText: {
    textDecorationLine: 'line-through',
  },
  // ── Sheet ──
});
