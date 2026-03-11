import { useTheme } from '@/theme';
import type { PdpGoal } from '@acme/shared';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

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
}

// ── Helpers ──

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function initSelections(goals: PdpGoal[]): Map<string, GoalSelectionState> {
  const map = new Map<string, GoalSelectionState>();
  for (const goal of goals) {
    map.set(goal.id, {
      selected: true,
      reviewDate: null,
      actions: new Map(goal.actions.map((a) => [a.id, true])),
    });
  }
  return map;
}

// ── Component ──

export function PdpGoalSelector({
  goals,
  selections,
  onToggleGoal,
  onToggleAction,
  onSetReviewDate,
}: PdpGoalSelectorProps) {
  const { colors } = useTheme();
  const [datePickerGoalId, setDatePickerGoalId] = useState<string | null>(null);

  const handleDateChange = useCallback(
    (_event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === 'android') {
        setDatePickerGoalId(null);
      }
      if (date && datePickerGoalId) {
        onSetReviewDate(datePickerGoalId, date);
      }
    },
    [datePickerGoalId, onSetReviewDate]
  );

  const dismissDatePicker = useCallback(() => {
    setDatePickerGoalId(null);
  }, []);

  return (
    <View style={styles.container}>
      {goals.map((goal) => {
        const sel = selections.get(goal.id);
        if (!sel) return null;

        return (
          <View
            key={goal.id}
            style={[
              styles.goalCard,
              {
                backgroundColor: sel.selected ? colors.surface : colors.background,
                borderLeftWidth: sel.selected ? 3 : 0,
                borderLeftColor: sel.selected ? colors.primary : 'transparent',
                opacity: sel.selected ? 1 : 0.65,
              },
            ]}
          >
            {/* Goal header with toggle */}
            <View style={styles.goalHeader}>
              <Switch
                value={sel.selected}
                onValueChange={() => onToggleGoal(goal.id)}
                trackColor={{ true: colors.primary }}
              />
              <Text
                style={[
                  styles.goalText,
                  { color: colors.text },
                  !sel.selected && styles.dimmedText,
                ]}
              >
                {goal.goal}
              </Text>
            </View>

            {sel.selected ? (
              <>
                {/* Review date chip */}
                <Pressable
                  onPress={() => setDatePickerGoalId(goal.id)}
                  style={[
                    styles.dateRow,
                    sel.reviewDate
                      ? {
                          backgroundColor: colors.primary + '15',
                          borderColor: colors.primary + '40',
                          borderWidth: 1,
                        }
                      : {
                          borderColor: colors.border,
                          borderWidth: 1,
                          borderStyle: 'dashed' as const,
                        },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={sel.reviewDate ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.dateText,
                      {
                        color: sel.reviewDate ? colors.text : colors.textSecondary,
                      },
                    ]}
                  >
                    {sel.reviewDate
                      ? `Review by ${formatDate(sel.reviewDate)}`
                      : 'Set review date'}
                  </Text>
                </Pressable>

                {/* Actions label */}
                <Text style={[styles.actionsLabel, { color: colors.textSecondary }]}>
                  Actions
                </Text>

                {/* Actions */}
                <View style={styles.actionsContainer}>
                  {goal.actions.map((action, index) => {
                    const isChecked = sel.actions.get(action.id) ?? true;

                    return (
                      <Pressable
                        key={action.id}
                        onPress={() => onToggleAction(goal.id, action.id)}
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
              </>
            ) : (
              <View style={styles.skippedContainer}>
                <Ionicons name="close-circle-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.skippedText, { color: colors.textSecondary }]}>
                  Skipped — will be archived
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {/* iOS: date picker in a bottom-sheet modal */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={datePickerGoalId !== null}
          transparent
          animationType="slide"
          onRequestClose={dismissDatePicker}
        >
          <Pressable style={styles.modalOverlay} onPress={dismissDatePicker}>
            <View
              style={[styles.iosDatePickerContainer, { backgroundColor: colors.surface }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.iosDatePickerHeader}>
                <Text style={[styles.iosDatePickerLabel, { color: colors.text }]}>
                  Select review date
                </Text>
                <Pressable onPress={dismissDatePicker}>
                  <Text style={[styles.iosDatePickerDone, { color: colors.primary }]}>Done</Text>
                </Pressable>
              </View>
              {datePickerGoalId && (
                <DateTimePicker
                  value={selections.get(datePickerGoalId)?.reviewDate ?? new Date()}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={handleDateChange}
                />
              )}
            </View>
          </Pressable>
        </Modal>
      )}

      {/* Android: native date dialog */}
      {datePickerGoalId && Platform.OS === 'android' && (
        <DateTimePicker
          value={selections.get(datePickerGoalId)?.reviewDate ?? new Date()}
          mode="date"
          minimumDate={new Date()}
          onChange={handleDateChange}
        />
      )}
    </View>
  );
}

// Re-export the helper for use in the entry detail screen
PdpGoalSelector.initSelections = initSelections;

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  goalCard: {
    borderRadius: 12,
    padding: 14,
    overflow: 'hidden',
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  goalText: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  dimmedText: {
    fontStyle: 'italic',
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
  skippedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  skippedText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  iosDatePickerContainer: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  iosDatePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iosDatePickerLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  iosDatePickerDone: {
    fontSize: 15,
    fontWeight: '600',
  },
});
