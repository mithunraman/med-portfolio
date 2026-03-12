import { Button, StatusPill } from '@/components';
import type { StatusVariant } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  addPdpGoalAction,
  fetchPdpGoal,
  selectPdpGoalById,
  updatePdpGoal,
  updatePdpGoalAction,
} from '@/store';
import { useTheme } from '@/theme';
import { PdpGoalStatus, type PdpGoalResponse } from '@acme/shared';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Helpers ────────────────────────────────────────────────────────────────

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

function getPdpGoalStatusDisplay(status: PdpGoalStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case PdpGoalStatus.ACTIVE:
      return { label: 'Active', variant: 'success' };
    case PdpGoalStatus.COMPLETED:
      return { label: 'Completed', variant: 'info' };
    case PdpGoalStatus.ARCHIVED:
      return { label: 'Archived', variant: 'default' };
    default:
      return { label: 'Pending', variant: 'processing' };
  }
}

// ── Date Picker Modal ──────────────────────────────────────────────────────

function DatePickerModal({
  visible,
  currentDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  currentDate: string | null;
  onSelect: (isoDate: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const today = toCalendarString(new Date());
  const selected = currentDate ? toCalendarString(new Date(currentDate)) : today;

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
            <Text style={[styles.modalTitle, { color: colors.text }]}>Set review date</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Calendar
            minDate={today}
            markedDates={{ [selected]: { selected: true, selectedColor: colors.primary } }}
            onDayPress={(day: { dateString: string }) => {
              onSelect(new Date(day.dateString).toISOString());
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

// ── Add Action Modal ───────────────────────────────────────────────────────

function AddActionModal({
  visible,
  onSubmit,
  onClose,
  submitting,
}: {
  visible: boolean;
  onSubmit: (text: string) => void;
  onClose: () => void;
  submitting: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  }, [text, onSubmit]);

  const handleClose = useCallback(() => {
    setText('');
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add action</Text>
            <TouchableOpacity onPress={handleClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[
              styles.textInput,
              { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            placeholder="Describe the action…"
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
          />
          <Button
            label="Add action"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!text.trim()}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Completion Review Modal ────────────────────────────────────────────────

function CompletionReviewModal({
  visible,
  currentReview,
  onSubmit,
  onClose,
  submitting,
}: {
  visible: boolean;
  currentReview: string | null;
  onSubmit: (review: string) => void;
  onClose: () => void;
  submitting: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(currentReview ?? '');

  useEffect(() => {
    setText(currentReview ?? '');
  }, [currentReview, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Completion review</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[
              styles.textInput,
              { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            placeholder="Write your reflection on completing this goal…"
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
          />
          <Button
            label="Save review"
            onPress={() => onSubmit(text.trim())}
            loading={submitting}
            disabled={!text.trim()}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Detail Screen ──────────────────────────────────────────────────────────

export default function PdpGoalDetailScreen() {
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { showActionSheetWithOptions } = useActionSheet();

  const goal = useAppSelector((state) => selectPdpGoalById(state, goalId ?? '')) as
    | PdpGoalResponse
    | undefined;
  const mutating = useAppSelector((state) => state.pdpGoals.mutating);

  useEffect(() => {
    if (goalId) {
      dispatch(fetchPdpGoal({ goalId }));
    }
  }, [goalId, dispatch]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const [showCompletionReview, setShowCompletionReview] = useState(false);

  const handleSetReviewDate = useCallback(
    (isoDate: string) => {
      if (!goalId) return;
      dispatch(updatePdpGoal({ goalId, data: { reviewDate: isoDate } }));
    },
    [goalId, dispatch]
  );

  const handleMarkComplete = useCallback(() => {
    if (!goalId) return;
    Alert.alert(
      'Mark goal as complete',
      'Are you sure you want to mark this goal as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark complete',
          onPress: () =>
            dispatch(updatePdpGoal({ goalId, data: { status: PdpGoalStatus.COMPLETED } })),
        },
      ]
    );
  }, [goalId, dispatch]);

  const handleArchive = useCallback(() => {
    if (!goalId) return;
    Alert.alert('Archive goal', 'Are you sure you want to archive this goal?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () =>
          dispatch(updatePdpGoal({ goalId, data: { status: PdpGoalStatus.ARCHIVED } })),
      },
    ]);
  }, [goalId, dispatch]);

  const handleShowMenu = useCallback(() => {
    showActionSheetWithOptions(
      {
        options: ['Archive goal', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (index) => {
        if (index === 0) handleArchive();
      }
    );
  }, [showActionSheetWithOptions, handleArchive]);

  // Set header right button once goal is loaded and not archived
  useEffect(() => {
    if (!goal || goal.status === PdpGoalStatus.ARCHIVED) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={handleShowMenu} hitSlop={8}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [goal?.status, navigation, colors.text, handleShowMenu]);

  const handleAddAction = useCallback(
    (actionText: string) => {
      if (!goalId) return;
      dispatch(addPdpGoalAction({ goalId, data: { action: actionText } })).then(() => {
        setShowAddAction(false);
      });
    },
    [goalId, dispatch]
  );

  const handleToggleAction = useCallback(
    (actionId: string, currentStatus: PdpGoalStatus) => {
      if (!goalId) return;
      const newStatus =
        currentStatus === PdpGoalStatus.ACTIVE ? PdpGoalStatus.PENDING : PdpGoalStatus.ACTIVE;
      dispatch(updatePdpGoalAction({ goalId, actionId, data: { status: newStatus } }));
    },
    [goalId, dispatch]
  );

  const handleSaveCompletionReview = useCallback(
    (review: string) => {
      if (!goalId) return;
      dispatch(updatePdpGoal({ goalId, data: { completionReview: review } })).then(() => {
        setShowCompletionReview(false);
      });
    },
    [goalId, dispatch]
  );

  const handleViewEntry = useCallback(() => {
    if (!goal?.artefactId) return;
    router.push(`/(entry)/${goal.artefactId}`);
  }, [goal?.artefactId, router]);

  if (!goal) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statusDisplay = getPdpGoalStatusDisplay(goal.status);
  const isActive = goal.status === PdpGoalStatus.ACTIVE;
  const isCompleted = goal.status === PdpGoalStatus.COMPLETED;
  const isArchived = goal.status === PdpGoalStatus.ARCHIVED;
  const visibleActions = goal.actions.filter((a) => a.status !== PdpGoalStatus.ARCHIVED);

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Goal header */}
        <View style={styles.section}>
          <Text style={[styles.goalText, { color: colors.text }]}>{goal.goal}</Text>
          <View style={styles.metaRow}>
            <StatusPill label={statusDisplay.label} variant={statusDisplay.variant} />
            {goal.reviewDate ? (
              <TouchableOpacity
                onPress={() => !isArchived && setShowDatePicker(true)}
                style={styles.reviewDateButton}
                disabled={isArchived}
              >
                <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.reviewDateText, { color: colors.textSecondary }]}>
                  Review by {formatDate(goal.reviewDate)}
                </Text>
              </TouchableOpacity>
            ) : (
              !isArchived && (
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={styles.reviewDateButton}
                >
                  <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                  <Text style={[styles.reviewDateText, { color: colors.primary }]}>
                    Set review date
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Actions</Text>
          <View style={[styles.actionsCard, { backgroundColor: colors.surface }]}>
            {visibleActions.length === 0 ? (
              <Text style={[styles.emptyActionsText, { color: colors.textSecondary }]}>
                No actions yet.
              </Text>
            ) : (
              visibleActions.map((action, index) => {
                const isDone = action.status === PdpGoalStatus.ACTIVE;
                const isLast = index === visibleActions.length - 1;

                return (
                  <Pressable
                    key={action.id}
                    onPress={() => !isArchived && handleToggleAction(action.id, action.status)}
                    style={[
                      styles.actionRow,
                      !isLast && styles.actionRowBorder,
                      { borderBottomColor: colors.border },
                    ]}
                    disabled={isArchived}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: isDone ? colors.primary : colors.textSecondary,
                          backgroundColor: isDone ? colors.primary : 'transparent',
                        },
                      ]}
                    >
                      {isDone && <Feather name="check" size={12} color="#fff" />}
                    </View>
                    <Text
                      style={[
                        styles.actionText,
                        { color: colors.text },
                        isDone && styles.actionTextDone,
                      ]}
                    >
                      {action.action}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>

          {!isArchived && (
            <TouchableOpacity
              style={[styles.addActionButton, { borderColor: colors.border }]}
              onPress={() => setShowAddAction(true)}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
              <Text style={[styles.addActionText, { color: colors.primary }]}>Add action</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Completion review */}
        {(isCompleted || goal.completionReview) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Completion review</Text>
            {goal.completionReview ? (
              <Pressable
                style={[styles.reviewCard, { backgroundColor: colors.surface }]}
                onPress={() => !isArchived && setShowCompletionReview(true)}
              >
                <Text style={[styles.reviewText, { color: colors.text }]}>
                  {goal.completionReview}
                </Text>
                {!isArchived && (
                  <Ionicons
                    name="pencil-outline"
                    size={16}
                    color={colors.textSecondary}
                    style={styles.reviewEditIcon}
                  />
                )}
              </Pressable>
            ) : (
              <Button
                label="Write completion review"
                onPress={() => setShowCompletionReview(true)}
                variant="ghost"
                icon={(color) => <Ionicons name="create-outline" size={18} color={color} />}
              />
            )}
          </View>
        )}

        {/* Mark as complete */}
        {isActive && (
          <View style={styles.section}>
            <Button
              label="Mark as complete"
              onPress={handleMarkComplete}
              loading={mutating}
              icon={(color) => <Ionicons name="checkmark-circle" size={20} color={color} />}
            />
          </View>
        )}

        {/* View entry */}
        {!!goal.artefactId && (
          <View style={styles.section}>
            <Button
              label="View entry"
              onPress={handleViewEntry}
              variant="ghost"
              icon={(color) => <Ionicons name="document-text-outline" size={18} color={color} />}
            />
          </View>
        )}
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        currentDate={goal.reviewDate}
        onSelect={handleSetReviewDate}
        onClose={() => setShowDatePicker(false)}
      />

      <AddActionModal
        visible={showAddAction}
        onSubmit={handleAddAction}
        onClose={() => setShowAddAction(false)}
        submitting={mutating}
      />

      <CompletionReviewModal
        visible={showCompletionReview}
        currentReview={goal.completionReview}
        onSubmit={handleSaveCompletionReview}
        onClose={() => setShowCompletionReview(false)}
        submitting={mutating}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  goalText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  reviewDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewDateText: {
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  actionsCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyActionsText: {
    padding: 16,
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  },
  actionTextDone: {
    opacity: 0.6,
  },
  addActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addActionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  reviewCard: {
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reviewText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  reviewEditIcon: {
    marginTop: 2,
  },

  // Modals
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
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
