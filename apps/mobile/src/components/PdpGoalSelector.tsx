import { useTheme } from '@/theme';
import { hexToRgba } from '@/utils/color';
import type { PdpGoal } from '@acme/shared';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

// ── Helpers ──

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function toCalendarString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
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

// ── Quick chip presets ──

const PRESETS = [
  { label: '1 week', getDays: () => addDays(new Date(), 7) },
  { label: '2 weeks', getDays: () => addDays(new Date(), 14) },
  { label: '1 month', getDays: () => addMonths(new Date(), 1) },
  { label: '2 months', getDays: () => addMonths(new Date(), 2) },
  { label: '3 months', getDays: () => addMonths(new Date(), 3) },
];

// ── Date picker bottom sheet ──

interface DatePickerSheetProps {
  visible: boolean;
  currentDate: Date | null;
  onSelect: (date: Date) => void;
  onClear: () => void;
  onDismiss: () => void;
}

function DatePickerSheet({
  visible,
  currentDate,
  onSelect,
  onClear,
  onDismiss,
}: DatePickerSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [showCalendar, setShowCalendar] = useState(false);

  const today = new Date();
  const minDateStr = toCalendarString(today);
  const selectedDateStr = currentDate ? toCalendarString(currentDate) : undefined;

  const handlePreset = useCallback(
    (getDate: () => Date) => {
      onSelect(getDate());
      onDismiss();
    },
    [onSelect, onDismiss]
  );

  const handleCalendarDay = useCallback(
    (day: { dateString: string }) => {
      const [y, m, d] = day.dateString.split('-').map(Number);
      onSelect(new Date(y, m - 1, d));
      onDismiss();
    },
    [onSelect, onDismiss]
  );

  const handleDismiss = useCallback(() => {
    setShowCalendar(false);
    onDismiss();
  }, [onDismiss]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <Pressable style={styles.sheetOverlay} onPress={handleDismiss}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Set review date</Text>
            {currentDate && (
              <Pressable
                onPress={() => {
                  onClear();
                  onDismiss();
                }}
              >
                <Text style={[styles.clearText, { color: colors.textSecondary }]}>Clear</Text>
              </Pressable>
            )}
          </View>

          {!showCalendar ? (
            <>
              {/* Quick chips */}
              <View style={styles.chipsGrid}>
                {PRESETS.map((preset) => {
                  const presetDate = preset.getDays();
                  const isSelected =
                    currentDate && toCalendarString(currentDate) === toCalendarString(presetDate);
                  return (
                    <Pressable
                      key={preset.label}
                      onPress={() => handlePreset(preset.getDays)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.background,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.chipLabel, { color: isSelected ? '#ffffff' : colors.text }]}
                      >
                        {preset.label}
                      </Text>
                      <Text
                        style={[
                          styles.chipDate,
                          { color: isSelected ? 'rgba(255,255,255,0.75)' : colors.textSecondary },
                        ]}
                      >
                        {formatDate(presetDate)}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setShowCalendar(true)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderStyle: 'dashed',
                    },
                  ]}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>Custom</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Pressable
                onPress={() => setShowCalendar(false)}
                style={[
                  styles.quickPickPill,
                  {
                    backgroundColor: hexToRgba(colors.primary, 0.08),
                    borderColor: hexToRgba(colors.primary, 0.25),
                  },
                ]}
              >
                <Ionicons name="flash" size={14} color={colors.primary} />
                <Text style={[styles.quickPickPillText, { color: colors.primary }]}>
                  Quick pick
                </Text>
              </Pressable>
              <Calendar
                minDate={minDateStr}
                current={selectedDateStr ?? minDateStr}
                markedDates={
                  selectedDateStr
                    ? { [selectedDateStr]: { selected: true, selectedColor: colors.primary } }
                    : {}
                }
                onDayPress={handleCalendarDay}
                theme={{
                  backgroundColor: colors.surface,
                  calendarBackground: colors.surface,
                  textSectionTitleColor: colors.textSecondary,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.textSecondary,
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                  textDayFontSize: 14,
                  textMonthFontSize: 15,
                  textDayHeaderFontSize: 12,
                }}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
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
        // addable — full-opacity text + a Track affordance, the whole card
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
        // tertiary Untrack at the foot. The date chip warns (amber) while unset —
        // it's required at finalise — and calms to primary once a date is chosen
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

            {/* Review date chip — disclosed on track; required at finalise */}
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

            {/* Untrack — tertiary, low-emphasis so it doesn't compete */}
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

      {/* Date picker bottom sheet — one shared instance */}
      <DatePickerSheet
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
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150,150,150,0.4)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  clearText: {
    fontSize: 14,
  },
  // ── Chips ──
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 2,
    minWidth: '45%',
    flex: 1,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  chipDate: {
    fontSize: 11,
  },
  // ── Calendar back nav ──
  quickPickPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
  },
  quickPickPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
