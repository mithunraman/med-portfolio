import { Button, EmptyState, StatusPill } from '@/components';
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
import { useCallback, useEffect, useMemo, useState } from 'react';
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

const WARNING_COLOR = '#f59e0b';

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
    case PdpGoalStatus.STARTED:
      return { label: 'Started', variant: 'success' };
    case PdpGoalStatus.COMPLETED:
      return { label: 'Completed', variant: 'info' };
    case PdpGoalStatus.ARCHIVED:
      return { label: 'Archived', variant: 'default' };
    default:
      return { label: 'Not started', variant: 'processing' };
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
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, PdpGoalStatus>>({});
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());

  const visibleActions = useMemo(
    () =>
      goal?.actions.filter(
        (a) => (optimisticStatuses[a.id] ?? a.status) !== PdpGoalStatus.ARCHIVED,
      ) ?? [],
    [goal?.actions, optimisticStatuses],
  );

  const handleSetReviewDate = useCallback(
    (isoDate: string) => {
      if (!goalId) return;
      dispatch(updatePdpGoal({ goalId, data: { reviewDate: isoDate } }));
    },
    [goalId, dispatch]
  );

  const handleMarkComplete = useCallback(() => {
    if (!goalId) return;
    const pendingActions = visibleActions.filter(
      (a) => (optimisticStatuses[a.id] ?? a.status) !== PdpGoalStatus.COMPLETED
    );
    if (pendingActions.length > 0) {
      Alert.alert(
        'Actions incomplete',
        'Complete all actions before marking this goal as complete.',
        [{ text: 'OK' }]
      );
      return;
    }
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
  }, [goalId, dispatch, visibleActions, optimisticStatuses]);

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

  const handleArchiveAction = useCallback(
    (actionId: string) => {
      if (!goalId) return;
      showActionSheetWithOptions(
        {
          options: ['Remove action', 'Cancel'],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (index) => {
          if (index === 0) {
            setOptimisticStatuses((prev) => ({ ...prev, [actionId]: PdpGoalStatus.ARCHIVED }));
            setPendingActionIds((prev) => new Set(prev).add(actionId));

            dispatch(
              updatePdpGoalAction({ goalId, actionId, data: { status: PdpGoalStatus.ARCHIVED } })
            )
              .unwrap()
              .then(() => {
                setOptimisticStatuses((prev) => {
                  const next = { ...prev };
                  delete next[actionId];
                  return next;
                });
              })
              .catch(() => {
                setOptimisticStatuses((prev) => {
                  const next = { ...prev };
                  delete next[actionId];
                  return next;
                });
                Alert.alert('Failed to remove action', 'Please try again.');
              })
              .finally(() => {
                setPendingActionIds((prev) => {
                  const next = new Set(prev);
                  next.delete(actionId);
                  return next;
                });
              });
          }
        }
      );
    },
    [goalId, dispatch, showActionSheetWithOptions]
  );

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
        currentStatus === PdpGoalStatus.COMPLETED ? PdpGoalStatus.STARTED : PdpGoalStatus.COMPLETED;

      // Optimistic update
      setOptimisticStatuses((prev) => ({ ...prev, [actionId]: newStatus }));
      setPendingActionIds((prev) => new Set(prev).add(actionId));

      dispatch(updatePdpGoalAction({ goalId, actionId, data: { status: newStatus } }))
        .unwrap()
        .then(() => {
          // Redux store is now updated — clear optimistic override
          setOptimisticStatuses((prev) => {
            const next = { ...prev };
            delete next[actionId];
            return next;
          });
        })
        .catch(() => {
          // Revert optimistic update and notify user
          setOptimisticStatuses((prev) => {
            const next = { ...prev };
            delete next[actionId];
            return next;
          });
          Alert.alert('Failed to update action', 'Please try again.');
        })
        .finally(() => {
          setPendingActionIds((prev) => {
            const next = new Set(prev);
            next.delete(actionId);
            return next;
          });
        });
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
  const isActive = goal.status === PdpGoalStatus.STARTED;
  const isCompleted = goal.status === PdpGoalStatus.COMPLETED;
  const isArchived = goal.status === PdpGoalStatus.ARCHIVED;
  const completedActionCount = visibleActions.filter(
    (a) => (optimisticStatuses[a.id] ?? a.status) === PdpGoalStatus.COMPLETED,
  ).length;
  const allActionsDone =
    visibleActions.length === 0 || completedActionCount === visibleActions.length;
  const isOverdue =
    isActive && !!goal.reviewDate && new Date(goal.reviewDate) < new Date();

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Goal header */}
        <View style={styles.section}>
          <Text style={[styles.goalText, { color: colors.text }]}>{goal.goal}</Text>
          {!!goal.artefactId && (
            <TouchableOpacity style={styles.provenanceRow} onPress={handleViewEntry}>
              <Ionicons name="document-text-outline" size={13} color={colors.textSecondary} style={styles.provenanceIcon} />
              <Text style={[styles.provenanceText, { color: colors.textSecondary }]} numberOfLines={2}>
                {goal.artefactTitle ?? 'View entry'}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.textSecondary} style={styles.provenanceIcon} />
            </TouchableOpacity>
          )}
          <View style={styles.metaRow}>
            <StatusPill label={statusDisplay.label} variant={statusDisplay.variant} />
            {isCompleted && goal.completedAt && (
              <View style={styles.reviewDateButton}>
                <Ionicons name="checkmark-circle-outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.reviewDateText, { color: colors.textSecondary }]}>
                  Completed {formatDate(goal.completedAt)}
                </Text>
              </View>
            )}
            {goal.reviewDate ? (
              <TouchableOpacity
                onPress={() => !isArchived && !isCompleted && setShowDatePicker(true)}
                style={styles.reviewDateButton}
                disabled={isArchived || isCompleted}
              >
                <Ionicons
                  name={isOverdue ? 'alert-circle-outline' : 'calendar-outline'}
                  size={14}
                  color={isOverdue ? WARNING_COLOR : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.reviewDateText,
                    { color: isOverdue ? WARNING_COLOR : colors.textSecondary },
                  ]}
                >
                  {isOverdue ? 'Overdue · ' : 'Review by '}
                  {formatDate(goal.reviewDate)}
                </Text>
              </TouchableOpacity>
            ) : (
              !isArchived && !isCompleted && (
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
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Actions</Text>
            {visibleActions.length > 0 && (
              <Text style={[styles.progressFraction, { color: colors.textSecondary }]}>
                {completedActionCount}/{visibleActions.length}
              </Text>
            )}
            <View style={styles.sectionTitleSpacer} />
            {isActive && visibleActions.length > 0 && (
              <Pressable
                hitSlop={8}
                onPress={() =>
                  Alert.alert('Remove an action', 'Long press any action to remove it.')
                }
              >
                <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
          <View style={[styles.actionsCard, { backgroundColor: colors.surface }]}>
            {visibleActions.length === 0 ? (
              <EmptyState
                variant="compact"
                icon="checkmark-outline"
                title="No actions yet"
                description={isActive ? 'Add actions to track progress toward this goal.' : undefined}
              />
            ) : (
              visibleActions.map((action, index) => {
                const effectiveStatus = optimisticStatuses[action.id] ?? action.status;
                const isDone = isCompleted || effectiveStatus === PdpGoalStatus.COMPLETED;
                const isLast = index === visibleActions.length - 1;
                const isPending = pendingActionIds.has(action.id);

                return (
                  <Pressable
                    key={action.id}
                    onPress={() => !isArchived && !isCompleted && !isPending && handleToggleAction(action.id, effectiveStatus)}
                    onLongPress={() => isActive && !isPending && handleArchiveAction(action.id)}
                    delayLongPress={400}
                    style={[
                      styles.actionRow,
                      !isLast && styles.actionRowBorder,
                      { borderBottomColor: colors.border },
                    ]}
                    disabled={isArchived || isCompleted || isPending}
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

          {!isArchived && !isCompleted && (
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
              <EmptyState
                icon="create-outline"
                title="How did it go?"
                description="Reflect on what you achieved and what you learned."
                actionLabel="Write reflection"
                onAction={() => setShowCompletionReview(true)}
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
              color={allActionsDone ? colors.primary : colors.textSecondary}
              icon={(color) => <Ionicons name="checkmark-circle" size={20} color={color} />}
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
  provenanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  provenanceText: {
    fontSize: 12,
    flexShrink: 1,
  },
  provenanceIcon: {
    marginTop: 1,
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitleSpacer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  progressFraction: {
    fontSize: 14,
    fontWeight: '500',
  },
  actionsCard: {
    borderRadius: 12,
    overflow: 'hidden',
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
