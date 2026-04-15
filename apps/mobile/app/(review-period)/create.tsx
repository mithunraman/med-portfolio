import { Button } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  createReviewPeriod,
  markDashboardStale,
  markReviewPeriodsStale,
  selectReviewPeriodById,
  updateReviewPeriod,
} from '@/store';
import { useTheme } from '@/theme';
import { ApiError } from '@acme/api-client';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
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

function toCalendarString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toISODateString(calendarString: string): string {
  return new Date(calendarString).toISOString();
}

// ── Date Picker Modal ────────────────────────────────────────────────────────

function DatePickerModal({
  visible,
  title,
  currentDate,
  minDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  currentDate: string | null;
  minDate?: string;
  onSelect: (isoDate: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const selected = currentDate ? toCalendarString(new Date(currentDate)) : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Calendar
            minDate={minDate}
            markedDates={
              selected
                ? { [selected]: { selected: true, selectedColor: colors.primary } }
                : undefined
            }
            onDayPress={(day: { dateString: string }) => {
              onSelect(toISODateString(day.dateString));
              onClose();
            }}
            theme={{
              backgroundColor: colors.background,
              calendarBackground: colors.background,
              textSectionTitleColor: colors.textSecondary,
              selectedDayBackgroundColor: colors.primary,
              selectedDayTextColor: '#fff',
              todayTextColor: colors.primary,
              dayTextColor: colors.text,
              textDisabledColor: colors.textSecondary,
              arrowColor: colors.primary,
              monthTextColor: colors.text,
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Create / Edit Screen ─────────────────────────────────────────────────────

export default function CreateReviewPeriodScreen() {
  const { xid } = useLocalSearchParams<{ xid?: string }>();
  const isEditMode = !!xid;

  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const navigation = useNavigation();

  const existingPeriod = useAppSelector((state) =>
    xid ? selectReviewPeriodById(state, xid) : undefined
  );
  const mutating = useAppSelector((state) => state.reviewPeriods.mutating);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Pre-fill for edit mode
  useEffect(() => {
    if (isEditMode && existingPeriod) {
      setName(existingPeriod.name);
      setStartDate(existingPeriod.startDate);
      setEndDate(existingPeriod.endDate);
    }
  }, [isEditMode, existingPeriod]);

  // Update header title for edit mode
  useEffect(() => {
    if (isEditMode) {
      navigation.setOptions({ title: 'Edit Review Period' });
    }
  }, [isEditMode, navigation]);

  const endDateMinDate = useMemo(() => {
    if (!startDate) return undefined;
    const next = new Date(startDate);
    next.setDate(next.getDate() + 1);
    return toCalendarString(next);
  }, [startDate]);

  // Reset endDate if it falls before new startDate
  useEffect(() => {
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      setEndDate(null);
    }
  }, [startDate, endDate]);

  const isValid = name.trim().length > 0 && !!startDate && !!endDate;

  const handleSubmit = useCallback(async () => {
    if (!isValid) return;

    try {
      if (isEditMode && xid) {
        await dispatch(
          updateReviewPeriod({
            xid,
            data: {
              name: name.trim(),
              startDate: startDate!,
              endDate: endDate!,
            },
          })
        ).unwrap();
      } else {
        await dispatch(
          createReviewPeriod({
            name: name.trim(),
            startDate: startDate!,
            endDate: endDate!,
          })
        ).unwrap();
      }

      // Refresh data in the background
      dispatch(markDashboardStale());
      dispatch(markReviewPeriodsStale());

      router.back();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        Alert.alert(
          'Already have an active period',
          'You can only have one active review period. Archive the current one first.'
        );
      } else {
        const message =
          typeof error === 'string'
            ? error
            : error instanceof Error
              ? error.message
              : 'Something went wrong';
        Alert.alert('Error', message);
      }
    }
  }, [isValid, isEditMode, xid, name, startDate, endDate, dispatch, router]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.flex, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.formContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Name</Text>
          <TextInput
            style={[
              styles.textInput,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            placeholder="e.g. ST2 Year 1 Review"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            maxLength={100}
            autoCapitalize="words"
            autoFocus={!isEditMode}
          />
        </View>

        {/* Start Date */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Start date</Text>
          <TouchableOpacity
            style={[
              styles.dateButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={() => setShowStartPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
            <Text
              style={[
                styles.dateButtonText,
                { color: startDate ? colors.text : colors.textSecondary },
              ]}
            >
              {startDate ? formatDate(startDate) : 'Select start date'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* End Date */}
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>End date</Text>
          <TouchableOpacity
            style={[
              styles.dateButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={() => setShowEndPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
            <Text
              style={[
                styles.dateButtonText,
                { color: endDate ? colors.text : colors.textSecondary },
              ]}
            >
              {endDate ? formatDate(endDate) : 'Select end date'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Submit */}
        <View style={styles.submitContainer}>
          <Button
            label={isEditMode ? 'Save changes' : 'Create review period'}
            onPress={handleSubmit}
            loading={mutating}
            disabled={!isValid}
          />
        </View>
      </ScrollView>

      <DatePickerModal
        visible={showStartPicker}
        title="Start date"
        currentDate={startDate}
        onSelect={setStartDate}
        onClose={() => setShowStartPicker(false)}
      />

      <DatePickerModal
        visible={showEndPicker}
        title="End date"
        currentDate={endDate}
        minDate={endDateMinDate}
        onSelect={setEndDate}
        onClose={() => setShowEndPicker(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  formContent: {
    padding: 20,
    gap: 20,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  dateButtonText: {
    fontSize: 15,
  },
  submitContainer: {
    marginTop: 8,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalCloseButton: {
    padding: 4,
  },
});
