import type { GoalSelectionState, StatusVariant } from '@/components';
import { Button, PdpGoalSelector, StatusPill } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchArtefact, finaliseArtefact, selectArtefactById, updateArtefactStatus } from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import type { PdpGoalSelection } from '@acme/shared';
import { ArtefactStatus, PdpGoalStatus } from '@acme/shared';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  const updatingStatus = useAppSelector((state) => state.artefacts.updatingStatus);

  useEffect(() => {
    if (artefactId) {
      dispatch(fetchArtefact({ artefactId }));
    }
  }, [artefactId, dispatch]);

  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [selectedCapability, setSelectedCapability] = useState<{
    name: string;
    evidence: string;
  } | null>(null);
  const [goalSelections, setGoalSelections] = useState<Map<string, GoalSelectionState>>(new Map());

  // Initialise goal selections when artefact loads in IN_REVIEW status
  useEffect(() => {
    if (artefact?.status === ArtefactStatus.IN_REVIEW && artefact.pdpGoals?.length) {
      setGoalSelections((prev) => {
        // Only initialise if not already set (avoid resetting user changes)
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

  // ── PDP Goal Selection Handlers ──

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

    // Validate: each selected goal must have a review date
    const selectedGoals = Array.from(goalSelections.entries()).filter(([, sel]) => sel.selected);
    const missingDates = selectedGoals.some(([, sel]) => !sel.reviewDate);

    if (missingDates) {
      Alert.alert('Review Date Required', 'Please set a review date for each selected goal.');
      return;
    }

    Alert.alert('Finalise entry', 'Once finalised, this entry will be saved to your portfolio and cannot be edited.', [
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

  // ── Header overflow menu (FINAL state) ──

  const handleShowMenu = useCallback(() => {
    showActionSheetWithOptions(
      {
        options: ['Archive entry', 'Cancel'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (index) => {
        if (index === 0) handleArchive();
      }
    );
  }, [showActionSheetWithOptions, handleArchive]);

  useEffect(() => {
    if (!artefact || artefact.status !== ArtefactStatus.COMPLETED) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={updatingStatus ? undefined : handleShowMenu} hitSlop={8} disabled={updatingStatus}>
          <Ionicons name="ellipsis-vertical" size={22} color={updatingStatus ? colors.textSecondary : colors.text} />
        </Pressable>
      ),
    });
  }, [artefact?.status, navigation, colors.text, colors.textSecondary, handleShowMenu, updatingStatus]);

  if (!artefact) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statusDisplay = getArtefactStatusDisplay(artefact.status);
  const canMarkAsFinal = artefact.status === ArtefactStatus.IN_REVIEW;
  const canArchive =
    artefact.status !== ArtefactStatus.ARCHIVED && artefact.status !== ArtefactStatus.COMPLETED;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}
    >
      {/* Header */}
      <View style={styles.section}>
        <Text style={[styles.title, { color: colors.text }]}>
          {artefact.title || 'Untitled entry'}
        </Text>
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
      {artefact.reflection && artefact.reflection.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Reflection</Text>
          {artefact.reflection.map((section, index) => (
            <Pressable
              key={index}
              onPress={() => toggleSection(index)}
              style={[styles.card, { backgroundColor: colors.surface }]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
                <Ionicons
                  name={expandedSections.has(index) ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textSecondary}
                />
              </View>
              {expandedSections.has(index) && (
                <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
                  {section.text}
                </Text>
              )}
            </Pressable>
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

      {/* PDP Goals */}
      {artefact.pdpGoals && artefact.pdpGoals.length > 0 && (
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
              .filter((goal) => goal.status !== PdpGoalStatus.ARCHIVED)
              .map((goal) => {
                const goalStatus = getPdpGoalStatusDisplay(goal.status);
                const visibleActions = goal.actions.filter(
                  (a) => a.status !== PdpGoalStatus.ARCHIVED
                );

                return (
                  <View
                    key={goal.id}
                    style={[styles.pdpGoalCard, { backgroundColor: colors.surface }]}
                  >
                    {/* Goal header with status pill */}
                    <View style={styles.pdpGoalHeader}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{goal.goal}</Text>
                      <StatusPill label={goalStatus.label} variant={goalStatus.variant} />
                    </View>

                    {/* Review date */}
                    {goal.reviewDate && (
                      <View style={styles.pdpReviewDateRow}>
                        <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.pdpReviewDateText, { color: colors.textSecondary }]}>
                          Review by {formatGoalDate(goal.reviewDate)}
                        </Text>
                      </View>
                    )}

                    {/* Actions */}
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

      {/* View Conversation */}
      <View style={styles.section}>
        <Button
          label="View conversation"
          onPress={() => router.push(`/(entry)/conversation/${artefact.conversation.id}`)}
          variant="ghost"
          icon={(color) => <Ionicons name="chatbubble-outline" size={18} color={color} />}
        />
      </View>

      {/* Archive */}
      {canArchive && (
        <View style={styles.archiveLinkContainer}>
          <Button
            label="Archive entry"
            onPress={handleArchive}
            variant="ghost"
            color="#dc3545"
            disabled={updatingStatus}
            icon={(color) => <Ionicons name="archive" size={18} color={color} />}
          />
        </View>
      )}
    </ScrollView>
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
  title: {
    fontSize: 22,
    fontWeight: '700',
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
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
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
  pdpCheckbox: {
    marginTop: 1,
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
  pdpArchivedGoalText: {
    opacity: 0.6,
  },
  pdpArchivedAction: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
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
  archiveLinkContainer: {
    paddingHorizontal: 16,
  },
});
