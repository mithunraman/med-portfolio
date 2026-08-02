import { useTheme } from '@/theme';
import { hexToRgba } from '@/utils/color';
import { formatDate } from '@/utils/formatDate';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Helpers ──

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

// ── Quick chip presets ──

const PRESETS = [
  { label: '1 week', getDays: () => addDays(new Date(), 7) },
  { label: '2 weeks', getDays: () => addDays(new Date(), 14) },
  { label: '1 month', getDays: () => addMonths(new Date(), 1) },
  { label: '2 months', getDays: () => addMonths(new Date(), 2) },
  { label: '3 months', getDays: () => addMonths(new Date(), 3) },
];

// ── Component ──

interface ReviewDatePickerSheetProps {
  visible: boolean;
  currentDate: Date | null;
  onSelect: (date: Date) => void;
  onDismiss: () => void;
  /** When provided (and a date is set), renders a "Clear" action. Omit on surfaces
   * where the review date can't be cleared. */
  onClear?: () => void;
}

/**
 * Shared two-step review-date picker: quick-pick chips (+ "Custom") → full calendar,
 * with a "Quick pick" pill to step back. Presentation-only and controlled - the
 * parent owns `visible` and the value, and receives the chosen `Date` via `onSelect`.
 * Reused by both PDP surfaces (entry-screen selector + standalone goal screen).
 */
export function ReviewDatePickerSheet({
  visible,
  currentDate,
  onSelect,
  onDismiss,
  onClear,
}: ReviewDatePickerSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [showCalendar, setShowCalendar] = useState(false);

  // Always open on the quick-pick chips (the default entry point). The sheet stays
  // mounted while hidden (parent only toggles `visible`), so its state persists -
  // reset on open so a prior "Custom → calendar" selection doesn't make the next
  // open skip the chips. One place, immune to which exit path closed the sheet.
  useEffect(() => {
    if (visible) setShowCalendar(false);
  }, [visible]);

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
            {currentDate && onClear && (
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

const styles = StyleSheet.create({
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

export default ReviewDatePickerSheet;
