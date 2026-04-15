import type { GoalSelectionState, StatusVariant } from '@/components';
import {
  Button,
  EditableReflectionSection,
  EditableTitle,
  ExportSheet,
  FullScreenSectionEditor,
  PdpGoalSelector,
  StatusPill,
} from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  deleteArtefact,
  duplicateToReview,
  editArtefact,
  fetchArtefact,
  finaliseArtefact,
  selectArtefactById,
  updateArtefactStatus,
} from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import type { PdpGoalSelection, ReflectionSection } from '@acme/shared';
import { ArtefactStatus, PdpGoalStatus } from '@acme/shared';
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
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AI_REASONING_COLOR = '#8B5CF6';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatGoalDate(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function getPdpGoalStatusDisplay(status: PdpGoalStatus): { label: string; variant: StatusVariant } {
  switch (status) {
    case PdpGoalStatus.STARTED:
      return { label: 'Started', variant: 'success' };
    case PdpGoalStatus.COMPLETED:
      return { label: 'Completed', variant: 'info' };
    case PdpGoalStatus.ARCHIVED:
      return { label: 'Archived', variant: 'default' };
    case PdpGoalStatus.NOT_STARTED:
      return { label: 'Not started', variant: 'processing' };
    default:
      return { label: 'Unknown', variant: 'default' };
  }
}

export default function EntryDetailScreen() {
  const { artefactId } = useLocalSearchParams<{ artefactId: string }>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const router = useRouter();
  const { showActionSheetWithOptions } = useActionSheet();

  const artefact = useAppSelector((state) => selectArtefactById(state, artefactId ?? ''));
  const entityStatus = useAppSelector(
    (state) => state.artefacts.statusById[artefactId ?? '']
  );
  const updatingStatus = entityStatus === 'updating';
  const saving = entityStatus === 'saving';

  useEffect(() => {
    if (artefactId) {
      dispatch(fetchArtefact({ artefactId }));
    }
  }, [artefactId, dispatch]);

  // ── Edit State ──

  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [editedReflection, setEditedReflection] = useState<ReflectionSection[] | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [selectedCapability, setSelectedCapability] = useState<{
    name: string;
    evidence: string;
  } | null>(null);
  const [goalSelections, setGoalSelections] = useState<Map<string, GoalSelectionState>>(new Map());
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const isEditable = artefact?.status === ArtefactStatus.IN_REVIEW;
  const canExport =
    artefact?.status === ArtefactStatus.IN_REVIEW || artefact?.status === ArtefactStatus.COMPLETED;

  const hasChanges = editedTitle !== null || editedReflection !== null;

  // Current displayed values (edited or server)
  const displayTitle = editedTitle ?? artefact?.title ?? '';
  const displayReflection = editedReflection ?? artefact?.reflection ?? [];

  // ── Edit Handlers ──

  const handleTitleChange = useCallback((text: string) => {
    setEditedTitle(text);
  }, []);

  const handleSectionSave = useCallback(
    (title: string, text: string) => {
      if (editingSectionIndex === null) return;
      setEditedReflection((prev) => {
        const sections = [...(prev ?? artefact?.reflection ?? [])];
        sections[editingSectionIndex] = { title, text };
        return sections;
      });
    },
    [editingSectionIndex, artefact?.reflection]
  );

  // ── Save Changes ──

  const handleSaveChanges = useCallback(async () => {
    if (!artefactId || !hasChanges) return;

    const payload: { artefactId: string; title?: string; reflection?: ReflectionSection[] } = {
      artefactId,
    };
    if (editedTitle !== null) payload.title = editedTitle;
    if (editedReflection !== null) payload.reflection = editedReflection;

    const result = await dispatch(editArtefact(payload));
    if (editArtefact.fulfilled.match(result)) {
      setEditedTitle(null);
      setEditedReflection(null);
      Alert.alert('Saved', 'Your changes have been saved.');
    } else {
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    }
  }, [artefactId, hasChanges, editedTitle, editedReflection, dispatch]);

  const handleDiscardChanges = useCallback(() => {
    Alert.alert('Discard changes?', 'All unsaved edits will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setEditedTitle(null);
          setEditedReflection(null);
        },
      },
    ]);
  }, []);

  // ── Discard on navigate away ──

  useEffect(() => {
    if (!hasChanges) return;

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Discard changes?', 'You have unsaved edits. Discard them?', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setEditedTitle(null);
            setEditedReflection(null);
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });

    return unsubscribe;
  }, [hasChanges, navigation]);

  // ── Existing handlers ──

  const toggleSection = useCallback((index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Initialise goal selections when artefact loads in IN_REVIEW status
  useEffect(() => {
    if (artefact?.status === ArtefactStatus.IN_REVIEW && artefact.pdpGoals?.length) {
      setGoalSelections((prev) => {
        if (prev.size > 0) return prev;
        const initial = new Map<string, GoalSelectionState>();
        for (const goal of artefact.pdpGoals!) {
          initial.set(goal.id, {
            selected: true,
            reviewDate: null,
            actions: new Map(goal.actions.map((a) => [a.id, true])),
          });
        }
        return initial;
      });
    }
  }, [artefact?.status, artefact?.pdpGoals]);

  const handleToggleGoal = useCallback((goalId: string) => {
    setGoalSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(goalId);
      if (current) {
        next.set(goalId, { ...current, selected: !current.selected });
      }
      return next;
    });
  }, []);

  const handleToggleAction = useCallback((goalId: string, actionId: string) => {
    setGoalSelections((prev) => {
      const next = new Map(prev);
      const goal = next.get(goalId);
      if (goal) {
        const newActions = new Map(goal.actions);
        newActions.set(actionId, !newActions.get(actionId));
        next.set(goalId, { ...goal, actions: newActions });
      }
      return next;
    });
  }, []);

  const handleSetReviewDate = useCallback((goalId: string, date: Date | null) => {
    setGoalSelections((prev) => {
      const next = new Map(prev);
      const goal = next.get(goalId);
      if (goal) {
        next.set(goalId, { ...goal, reviewDate: date });
      }
      return next;
    });
  }, []);

  // ── Finalise Entry ──

  const handleMarkAsFinal = useCallback(() => {
    if (!artefactId) return;

    const selectedGoals = Array.from(goalSelections.entries()).filter(([, sel]) => sel.selected);
    const missingDates = selectedGoals.some(([, sel]) => !sel.reviewDate);

    if (missingDates) {
      Alert.alert('Review Date Required', 'Please set a review date for each selected goal.');
      return;
    }

    Alert.alert('Finalise entry', 'Once finalised, this entry will be saved to your portfolio.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finalise',
        onPress: () => {
          const pdpGoalSelections: PdpGoalSelection[] = Array.from(goalSelections.entries()).map(
            ([goalId, sel]) => ({
              goalId,
              selected: sel.selected,
              reviewDate: sel.selected && sel.reviewDate ? sel.reviewDate.toISOString() : null,
              actions: sel.selected
                ? Array.from(sel.actions.entries()).map(([actionId, selected]) => ({
                    actionId,
                    selected,
                  }))
                : undefined,
            })
          );

          dispatch(finaliseArtefact({ artefactId, pdpGoalSelections }));
        },
      },
    ]);
  }, [artefactId, dispatch, goalSelections]);

  // ── Archive ──

  const hasActivePdpGoals = useMemo(() => {
    if (!artefact?.pdpGoals) return false;
    return artefact.pdpGoals.some(
      (g) => g.status === PdpGoalStatus.STARTED || g.status === PdpGoalStatus.COMPLETED
    );
  }, [artefact?.pdpGoals]);

  const handleArchive = useCallback(() => {
    if (!artefactId) return;

    if (hasActivePdpGoals) {
      Alert.alert(
        'Archive Entry',
        'This entry has active PDP goals. What would you like to do with them?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Keep Goals',
            onPress: () => {
              dispatch(
                updateArtefactStatus({
                  artefactId,
                  status: ArtefactStatus.ARCHIVED,
                  archivePdpGoals: false,
                })
              );
            },
          },
          {
            text: 'Archive All',
            style: 'destructive',
            onPress: () => {
              dispatch(
                updateArtefactStatus({
                  artefactId,
                  status: ArtefactStatus.ARCHIVED,
                  archivePdpGoals: true,
                })
              );
            },
          },
        ]
      );
    } else {
      Alert.alert('Archive Entry', 'Are you sure you want to archive this entry?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            dispatch(
              updateArtefactStatus({
                artefactId,
                status: ArtefactStatus.ARCHIVED,
              })
            );
          },
        },
      ]);
    }
  }, [artefactId, dispatch, hasActivePdpGoals]);

  // ── Delete Entry ──

  const handleDelete = useCallback(() => {
    if (!artefactId) return;
    Alert.alert(
      'Delete Entry',
      'This will permanently delete this entry, its conversation, and all linked goals. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            dispatch(deleteArtefact({ artefactId }))
              .unwrap()
              .then(() => router.back())
              .catch(() => Alert.alert('Error', 'Failed to delete entry. Please try again.'));
          },
        },
      ]
    );
  }, [artefactId, dispatch, router]);

  // ── Duplicate to Review ──

  const handleClone = useCallback(() => {
    if (!artefactId) return;
    Alert.alert(
      'Duplicate Entry',
      'Duplicate this entry and all its data into a new artefact in review?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Duplicate',
          onPress: async () => {
            const result = await dispatch(duplicateToReview({ artefactId }));
            if (duplicateToReview.fulfilled.match(result)) {
              router.replace(`/(entry)/${result.payload.id}`);
            }
          },
        },
      ]
    );
  }, [artefactId, dispatch, router]);

  // ── Header overflow menu ──

  const showHeaderMenu =
    artefact?.status !== undefined && artefact?.status !== ArtefactStatus.IN_CONVERSATION;

  const handleShowMenu = useCallback(() => {
    if (artefact?.status === ArtefactStatus.COMPLETED) {
      showActionSheetWithOptions(
        {
          options: ['Archive entry', 'Duplicate entry', 'Delete entry', 'Cancel'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 3,
        },
        (index) => {
          if (index === 0) handleArchive();
          if (index === 1) handleClone();
          if (index === 2) handleDelete();
        }
      );
    } else if (artefact?.status === ArtefactStatus.ARCHIVED) {
      showActionSheetWithOptions(
        {
          options: ['Delete entry', 'Cancel'],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (index) => {
          if (index === 0) handleDelete();
        }
      );
    } else if (artefact?.status !== undefined) {
      showActionSheetWithOptions(
        {
          options: ['Archive entry', 'Delete entry', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) handleArchive();
          if (index === 1) handleDelete();
        }
      );
    }
  }, [artefact?.status, showActionSheetWithOptions, handleArchive, handleClone, handleDelete]);

  useEffect(() => {
    if (!artefact) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {canExport && (
            <Pressable onPress={() => setExportSheetVisible(true)} hitSlop={8}>
              <Feather name="share" size={20} color={colors.text} />
            </Pressable>
          )}
          {showHeaderMenu && (
            <Pressable
              onPress={updatingStatus ? undefined : handleShowMenu}
              hitSlop={8}
              disabled={updatingStatus}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={22}
                color={updatingStatus ? colors.textSecondary : colors.text}
              />
            </Pressable>
          )}
        </View>
      ),
    });
  }, [
    artefact,
    canExport,
    showHeaderMenu,
    navigation,
    colors.text,
    colors.textSecondary,
    handleShowMenu,
    updatingStatus,
  ]);

  const loading = entityStatus === 'loading';

  if (!artefact || loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statusDisplay = getArtefactStatusDisplay(artefact.status);
  const canMarkAsFinal = artefact.status === ArtefactStatus.IN_REVIEW;
  const isArchivedEntry = artefact.status === ArtefactStatus.ARCHIVED;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.section}>
          <EditableTitle value={displayTitle} onChange={handleTitleChange} editable={isEditable} />
          <View style={styles.headerMeta}>
            {artefact.artefactTypeLabel && (
              <View style={[styles.typeBadge, { backgroundColor: colors.surface }]}>
                <Text style={[styles.typeBadgeText, { color: colors.textSecondary }]}>
                  {artefact.artefactTypeLabel}
                </Text>
              </View>
            )}
            <StatusPill label={statusDisplay.label} variant={statusDisplay.variant} />
          </View>
        </View>

        {/* Reflection Sections */}
        {displayReflection.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Reflection</Text>
            {displayReflection.map((section, index) => (
              <EditableReflectionSection
                key={index}
                section={section}
                editable={isEditable}
                expanded={expandedSections.has(index)}
                onToggleExpand={() => toggleSection(index)}
                onEdit={() => setEditingSectionIndex(index)}
              />
            ))}
          </View>
        )}

        {/* Capabilities */}
        {artefact.capabilities && artefact.capabilities.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Capabilities</Text>
            {artefact.capabilities.map((cap, index) => (
              <Pressable
                key={index}
                onPress={() => setSelectedCapability(cap)}
                style={[styles.capabilityRow, { backgroundColor: colors.surface }]}
              >
                <Text style={[styles.capabilityCode, { color: colors.primary }]}>{cap.name}</Text>
                <Ionicons name="information-circle-outline" size={20} color={AI_REASONING_COLOR} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Capability Evidence Modal */}
        <Modal
          visible={selectedCapability !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedCapability(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.primary }]}>
                  {selectedCapability?.name}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelectedCapability(null)}
                  style={styles.modalCloseButton}
                >
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Evidence</Text>
                <Text style={[styles.modalText, { color: colors.text }]}>
                  {selectedCapability?.evidence}
                </Text>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Full Screen Section Editor */}
        <FullScreenSectionEditor
          visible={editingSectionIndex !== null}
          sectionTitle={
            editingSectionIndex !== null
              ? (displayReflection[editingSectionIndex]?.title ?? '')
              : ''
          }
          sectionText={
            editingSectionIndex !== null ? (displayReflection[editingSectionIndex]?.text ?? '') : ''
          }
          onSave={handleSectionSave}
          onClose={() => setEditingSectionIndex(null)}
        />

        {/* PDP Goals */}
        {artefact.pdpGoals &&
          (canMarkAsFinal || isArchivedEntry
            ? artefact.pdpGoals.length > 0
            : artefact.pdpGoals.some((g) => g.status !== PdpGoalStatus.ARCHIVED)) && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>PDP Goals</Text>
              {canMarkAsFinal ? (
                <PdpGoalSelector
                  goals={artefact.pdpGoals}
                  selections={goalSelections}
                  onToggleGoal={handleToggleGoal}
                  onToggleAction={handleToggleAction}
                  onSetReviewDate={handleSetReviewDate}
                  disabled={updatingStatus}
                />
              ) : (
                artefact.pdpGoals
                  .filter((goal) => isArchivedEntry || goal.status !== PdpGoalStatus.ARCHIVED)
                  .map((goal) => {
                    const goalStatus = getPdpGoalStatusDisplay(goal.status);
                    const visibleActions = isArchivedEntry
                      ? goal.actions
                      : goal.actions.filter((a) => a.status !== PdpGoalStatus.ARCHIVED);

                    return (
                      <View
                        key={goal.id}
                        style={[styles.pdpGoalCard, { backgroundColor: colors.surface }]}
                      >
                        <View style={styles.pdpGoalHeader}>
                          <Text style={[styles.cardTitle, { color: colors.text }]}>
                            {goal.goal}
                          </Text>
                          <StatusPill label={goalStatus.label} variant={goalStatus.variant} />
                        </View>

                        {goal.reviewDate && (
                          <View style={styles.pdpReviewDateRow}>
                            <Ionicons
                              name="calendar-outline"
                              size={14}
                              color={colors.textSecondary}
                            />
                            <Text
                              style={[styles.pdpReviewDateText, { color: colors.textSecondary }]}
                            >
                              Review by {formatGoalDate(goal.reviewDate)}
                            </Text>
                          </View>
                        )}

                        <View style={styles.pdpActions}>
                          {visibleActions.map((action, actionIndex) => {
                            const actionActive = action.status === PdpGoalStatus.STARTED;

                            return (
                              <View
                                key={action.id}
                                style={[
                                  styles.pdpRow,
                                  actionIndex === visibleActions.length - 1 && styles.pdpRowLast,
                                ]}
                              >
                                {actionActive ? (
                                  <View
                                    style={[
                                      styles.pdpActionCheckbox,
                                      {
                                        borderColor: colors.primary,
                                        backgroundColor: colors.primary,
                                      },
                                    ]}
                                  >
                                    <Feather name="check" size={14} color="#ffffff" />
                                  </View>
                                ) : (
                                  <View
                                    style={[
                                      styles.pdpActionCheckbox,
                                      {
                                        borderColor: colors.textSecondary,
                                        backgroundColor: 'transparent',
                                      },
                                    ]}
                                  />
                                )}
                                <Text style={[styles.pdpText, { color: colors.text }]}>
                                  {action.action}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })
              )}
            </View>
          )}

        {/* Actions — hidden when there are unsaved changes */}
        {!hasChanges && (
          <>
            {/* Navigation links */}
            <View style={styles.section}>
              <View style={[styles.navGroup, { backgroundColor: colors.surface }]}>
                <Pressable
                  onPress={() => router.push(`/(entry)/conversation/${artefact.conversation.id}`)}
                  style={styles.navRow}
                >
                  <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
                  <Text style={[styles.navRowLabel, { color: colors.text }]}>
                    View conversation
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </Pressable>
                {artefact.versionCount > 0 && (
                  <>
                    <View style={[styles.navDivider, { backgroundColor: colors.border }]} />
                    <Pressable
                      onPress={() => router.push(`/(entry)/versions/${artefact.id}`)}
                      style={styles.navRow}
                    >
                      <Feather name="clock" size={18} color={colors.textSecondary} />
                      <Text style={[styles.navRowLabel, { color: colors.text }]}>
                        Version history
                      </Text>
                      <View style={styles.navRowRight}>
                        <Text style={[styles.navBadge, { color: colors.textSecondary }]}>
                          {artefact.versionCount}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                      </View>
                    </Pressable>
                  </>
                )}
              </View>
            </View>

            {/* Finalise Entry */}
            {canMarkAsFinal && (
              <View style={styles.section}>
                <Button
                  label="Finalise entry"
                  onPress={handleMarkAsFinal}
                  loading={updatingStatus}
                  icon={(color) => <Ionicons name="checkmark-circle" size={20} color={color} />}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Sticky Save / Discard bar */}
      {hasChanges && (
        <View
          style={[
            styles.stickyBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <Pressable
            onPress={handleDiscardChanges}
            disabled={saving}
            style={[styles.stickyDiscardButton, { borderColor: colors.border }]}
          >
            <Feather name="x" size={18} color={saving ? colors.textSecondary : '#dc3545'} />
          </Pressable>
          <View style={styles.stickySaveWrapper}>
            <Button
              label="Save changes"
              onPress={handleSaveChanges}
              loading={saving}
              icon={(color) => <Feather name="save" size={18} color={color} />}
            />
          </View>
        </View>
      )}
      {canExport && (
        <ExportSheet
          visible={exportSheetVisible}
          onClose={() => setExportSheetVisible(false)}
          artefact={artefact}
        />
      )}
    </KeyboardAvoidingView>
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
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  capabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  capabilityCode: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    flexGrow: 0,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    lineHeight: 22,
  },
  pdpGoalCard: {
    borderRadius: 12,
    padding: 14,
    overflow: 'hidden',
  },
  pdpActions: {
    marginTop: 8,
    marginLeft: 4,
  },
  pdpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  pdpRowLast: {
    borderBottomWidth: 0,
  },
  pdpText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
    flexShrink: 1,
  },
  pdpGoalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  pdpReviewDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  pdpReviewDateText: {
    fontSize: 13,
  },
  pdpActionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  navGroup: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  navRowLabel: {
    fontSize: 15,
    flex: 1,
  },
  navRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navBadge: {
    fontSize: 14,
  },
  navDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 42,
  },
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stickyDiscardButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickySaveWrapper: {
    flex: 1,
  },
});
