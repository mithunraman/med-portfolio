import type { GoalSelectionState, StatusVariant } from '@/components';
import {
  ArtefactAdvisoryBanner,
  Button,
  EditableReflectionSection,
  EditableTitle,
  ExportSheet,
  FullScreenSectionEditor,
  PdpGoalSelector,
  ReviewSheet,
  StarRating,
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
import { formatTimeAgo } from '@/utils/formatTimeAgo';
import type {
  Capability,
  ComposedDocumentField,
  EditArtefactRequest,
  PdpGoalSelection,
} from '@acme/shared';
import { ArtefactStatus, PdpGoalStatus } from '@acme/shared';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
const COMPLETED_ACCENT = '#28a745';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Toggle a value's membership in a Set immutably (returns a new Set). Shared by
// the section (keyed by index) and capability (keyed by code) expand toggles.
function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

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
  const entityStatus = useAppSelector((state) => state.artefacts.statusById[artefactId ?? '']);
  const updatingStatus = entityStatus === 'updating';
  const saving = entityStatus === 'saving';

  useEffect(() => {
    if (artefactId) {
      dispatch(fetchArtefact({ artefactId }));
    }
  }, [artefactId, dispatch]);

  // ── Edit State ──

  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [editedDocument, setEditedDocument] = useState<ComposedDocumentField[] | null>(null);
  const [editedCapabilities, setEditedCapabilities] = useState<Capability[] | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  // Capability edit/expand state is keyed by capability code (the API's natural
  // key), not list position — so a future display-time sort/filter can't misalign
  // an in-flight edit onto the wrong capability.
  const [expandedCapabilities, setExpandedCapabilities] = useState<Set<string>>(new Set());
  const [goalSelections, setGoalSelections] = useState<Map<string, GoalSelectionState>>(new Map());
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [editingCapabilityCode, setEditingCapabilityCode] = useState<string | null>(null);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const [reviewSheetVisible, setReviewSheetVisible] = useState(false);
  // Seeds a first-time (create) review from the inline star tap. Ignored on the edit
  // path, where the sheet seeds from the existing review.
  const [reviewSeedRating, setReviewSeedRating] = useState<number | undefined>(undefined);
  const isEditable = artefact?.status === ArtefactStatus.IN_REVIEW;
  const canExport =
    artefact?.status === ArtefactStatus.IN_REVIEW || artefact?.status === ArtefactStatus.COMPLETED;

  const hasChanges =
    editedTitle !== null || editedDocument !== null || editedCapabilities !== null;

  // Current displayed values (edited or server). The composed document is the
  // single source of truth for the entry body — shown and edited in place.
  const displayTitle = editedTitle ?? artefact?.title ?? '';
  const displayDocument = editedDocument ?? artefact?.composedDocument ?? [];
  const displayCapabilities = editedCapabilities ?? artefact?.capabilities ?? [];
  const editingCapability =
    editingCapabilityCode !== null
      ? displayCapabilities.find((c) => c.code === editingCapabilityCode)
      : undefined;

  // ── Edit Handlers ──

  const handleTitleChange = useCallback((text: string) => {
    setEditedTitle(text);
  }, []);

  const handleSectionSave = useCallback(
    (_title: string, text: string) => {
      if (editingSectionIndex === null) return;
      setEditedDocument((prev) => {
        const sections = [...(prev ?? artefact?.composedDocument ?? [])];
        const current = sections[editingSectionIndex];
        if (current) sections[editingSectionIndex] = { ...current, text };
        return sections;
      });
    },
    [editingSectionIndex, artefact?.composedDocument]
  );

  // Mirrors handleSectionSave: overwrite only the edited capability's justification,
  // matched by code; name and evidence stay untouched.
  const handleCapabilitySave = useCallback(
    (_title: string, text: string) => {
      if (editingCapabilityCode === null) return;
      setEditedCapabilities((prev) =>
        (prev ?? artefact?.capabilities ?? []).map((c) =>
          c.code === editingCapabilityCode ? { ...c, justification: text } : c
        )
      );
    },
    [editingCapabilityCode, artefact?.capabilities]
  );

  // ── Save Changes ──

  const handleSaveChanges = useCallback(async () => {
    if (!artefactId || !hasChanges) return;

    const payload: { artefactId: string } & EditArtefactRequest = { artefactId };
    if (editedTitle !== null) payload.title = editedTitle;
    if (editedDocument !== null) {
      payload.composedDocument = editedDocument.map((s) => ({ sectionId: s.sectionId, text: s.text }));
    }
    if (editedCapabilities !== null) {
      payload.capabilities = editedCapabilities.map((c) => ({
        code: c.code,
        justification: c.justification ?? '',
      }));
    }

    const result = await dispatch(editArtefact(payload));
    if (editArtefact.fulfilled.match(result)) {
      setEditedTitle(null);
      setEditedDocument(null);
      setEditedCapabilities(null);
      Alert.alert('Saved', 'Your changes have been saved.');
    } else {
      Alert.alert('Error', 'Failed to save changes. Please try again.');
    }
  }, [artefactId, hasChanges, editedTitle, editedDocument, editedCapabilities, dispatch]);

  const handleDiscardChanges = useCallback(() => {
    Alert.alert('Discard changes?', 'All unsaved edits will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setEditedTitle(null);
          setEditedDocument(null);
          setEditedCapabilities(null);
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
            setEditedDocument(null);
            setEditedCapabilities(null);
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });

    return unsubscribe;
  }, [hasChanges, navigation]);

  // ── Existing handlers ──

  const toggleCapability = useCallback((code: string) => {
    setExpandedCapabilities((prev) => toggleInSet(prev, code));
  }, []);

  const toggleSection = useCallback((index: number) => {
    setExpandedSections((prev) => toggleInSet(prev, index));
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
        <View style={styles.headerActions}>
          {canExport && (
            <Pressable
              onPress={() => setExportSheetVisible(true)}
              hitSlop={8}
              style={styles.headerButton}
            >
              <Feather name="share" size={20} color={colors.text} />
            </Pressable>
          )}
          {showHeaderMenu && (
            <Pressable
              onPress={updatingStatus ? undefined : handleShowMenu}
              hitSlop={8}
              disabled={updatingStatus}
              style={[styles.headerButton, canExport && styles.headerButtonSpaced]}
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

        {/* Soft "needs your input" advisory — shows only in review with unmet sections */}
        <ArtefactAdvisoryBanner artefactId={artefactId} />

        {/* Entry document — the canonical FourteenFish-shaped output, editable in
            place while in review. Single source of truth for the entry body. */}
        {displayDocument.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Entry</Text>
            {displayDocument.map((field, index) => (
              <EditableReflectionSection
                key={field.sectionId}
                section={{ title: field.label, text: field.text }}
                editable={isEditable}
                expanded={expandedSections.has(index)}
                onToggleExpand={() => toggleSection(index)}
                onEdit={() => setEditingSectionIndex(index)}
              />
            ))}
          </View>
        )}

        {/* Capabilities — only the trainee's justification is shown (the evidence
            quote is internal provenance). Editable in place, mirroring the entry
            sections: justification text is the trainee's paste-ready own words. */}
        {displayCapabilities.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Capabilities</Text>
            {displayCapabilities.map((cap) => (
              <EditableReflectionSection
                key={cap.code}
                section={{ title: cap.name, text: cap.justification ?? '' }}
                editable={isEditable}
                expanded={expandedCapabilities.has(cap.code)}
                onToggleExpand={() => toggleCapability(cap.code)}
                onEdit={() => setEditingCapabilityCode(cap.code)}
                emptyHint={`Tap to add your justification for ${cap.name}`}
              />
            ))}
          </View>
        )}

        {/* Full Screen Section Editor — entry sections */}
        <FullScreenSectionEditor
          visible={editingSectionIndex !== null}
          sectionTitle={
            editingSectionIndex !== null
              ? (displayDocument[editingSectionIndex]?.label ?? '')
              : ''
          }
          sectionText={
            editingSectionIndex !== null ? (displayDocument[editingSectionIndex]?.text ?? '') : ''
          }
          onSave={handleSectionSave}
          onClose={() => setEditingSectionIndex(null)}
        />

        {/* Full Screen Section Editor — capability justifications */}
        <FullScreenSectionEditor
          visible={editingCapabilityCode !== null}
          sectionTitle={editingCapability?.name ?? ''}
          sectionText={editingCapability?.justification ?? ''}
          onSave={handleCapabilitySave}
          onClose={() => setEditingCapabilityCode(null)}
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
                    const isCompleted = goal.status === PdpGoalStatus.COMPLETED;
                    const visibleActions = isArchivedEntry
                      ? goal.actions
                      : goal.actions.filter((a) => a.status !== PdpGoalStatus.ARCHIVED);

                    return (
                      <View
                        key={goal.id}
                        style={[
                          styles.pdpGoalCard,
                          { backgroundColor: colors.surface },
                          isCompleted && {
                            borderLeftWidth: 4,
                            borderLeftColor: COMPLETED_ACCENT,
                            opacity: 0.55,
                          },
                        ]}
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
                            const actionActive =
                              action.status === PdpGoalStatus.STARTED ||
                              action.status === PdpGoalStatus.COMPLETED;

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
                                        borderColor: isCompleted
                                          ? COMPLETED_ACCENT
                                          : colors.primary,
                                        backgroundColor: isCompleted
                                          ? COMPLETED_ACCENT
                                          : colors.primary,
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

        {/* Your rating — hidden until the artefact has AI output to rate */}
        {!hasChanges && artefact.status !== ArtefactStatus.IN_CONVERSATION && (
          <View style={styles.section}>
            {artefact.review ? (
              <Pressable
                style={[styles.reviewCard, { backgroundColor: colors.surface }]}
                onPress={() => setReviewSheetVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit your rating"
              >
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewPromptRow}>
                    <Ionicons name="sparkles" size={14} color={AI_REASONING_COLOR} />
                    <Text style={[styles.reviewHeaderText, { color: colors.textSecondary }]}>
                      Your rating of the AI
                    </Text>
                  </View>
                  <Feather name="edit-2" size={15} color={colors.textSecondary} />
                </View>
                <StarRating value={artefact.review.rating} readOnly size={22} />
                {artefact.review.comment ? (
                  <Text
                    style={[styles.reviewComment, { color: colors.text }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {artefact.review.comment}
                  </Text>
                ) : null}
                <Text style={[styles.reviewMeta, { color: colors.textSecondary }]}>
                  Rated {formatTimeAgo(artefact.review.updatedAt)}
                </Text>
              </Pressable>
            ) : (
              <View style={[styles.reviewCard, { backgroundColor: colors.surface }]}>
                <View style={styles.reviewPromptRow}>
                  <Ionicons name="sparkles" size={15} color={AI_REASONING_COLOR} />
                  <Text style={[styles.reviewPrompt, { color: colors.text }]}>
                    How well did the AI capture this entry?
                  </Text>
                </View>
                <Text style={[styles.reviewHelper, { color: colors.textSecondary }]}>
                  Your feedback on the AI&rsquo;s response. Private to you - it helps us improve.
                </Text>
                <View style={styles.reviewEmptyStars}>
                  <StarRating
                    value={0}
                    size={32}
                    gap={12}
                    onChange={(rating) => {
                      setReviewSeedRating(rating);
                      setReviewSheetVisible(true);
                    }}
                  />
                </View>
              </View>
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
      <ReviewSheet
        visible={reviewSheetVisible}
        onClose={() => setReviewSheetVisible(false)}
        artefact={artefact}
        initialRating={reviewSeedRating}
      />
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonSpaced: {
    marginLeft: 8,
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
  reviewCard: {
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  reviewPrompt: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  reviewHelper: {
    fontSize: 12,
    lineHeight: 17,
  },
  reviewHeaderText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reviewEmptyStars: {
    alignSelf: 'flex-start',
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 20,
  },
  reviewMeta: {
    fontSize: 12,
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
