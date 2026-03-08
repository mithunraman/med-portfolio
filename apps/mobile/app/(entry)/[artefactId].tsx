import { StatusPill } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchArtefact, selectArtefactById, updateArtefactStatus } from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import { ArtefactStatus, PdpGoalStatus } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

const ACCENT_COLOR = '#00a884';
const AI_REASONING_COLOR = '#8B5CF6';

export default function EntryDetailScreen() {
  const { artefactId } = useLocalSearchParams<{ artefactId: string }>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

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

  const handleMarkAsFinal = useCallback(() => {
    if (!artefactId) return;
    Alert.alert('Mark as Final', 'Are you sure? This marks the entry as ready for export.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark as Final',
        onPress: () => {
          dispatch(updateArtefactStatus({ artefactId, status: ArtefactStatus.FINAL }));
        },
      },
    ]);
  }, [artefactId, dispatch]);

  if (!artefact) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statusDisplay = getArtefactStatusDisplay(artefact.status);
  const canMarkAsFinal = artefact.status === ArtefactStatus.REVIEW;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
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
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={AI_REASONING_COLOR}
              />
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

      {/* PDP Goals (read-only) */}
      {artefact.pdpGoals && artefact.pdpGoals.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>PDP Goals</Text>
          {artefact.pdpGoals.map((goal) => (
            <View key={goal.id} style={[styles.pdpGoalCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{goal.goal}</Text>
              <View style={styles.pdpActions}>
                {goal.actions.map((action, actionIndex) => (
                  <View
                    key={action.id}
                    style={[
                      styles.pdpRow,
                      actionIndex === goal.actions.length - 1 && styles.pdpRowLast,
                    ]}
                  >
                    <Ionicons
                      name={
                        action.status === PdpGoalStatus.COMPLETED ? 'checkbox' : 'square-outline'
                      }
                      size={20}
                      color={
                        action.status === PdpGoalStatus.COMPLETED
                          ? colors.primary
                          : colors.textSecondary
                      }
                      style={styles.pdpCheckbox}
                    />
                    <Text
                      style={[
                        styles.pdpText,
                        { color: colors.text },
                        action.status === PdpGoalStatus.COMPLETED && styles.pdpCompleted,
                      ]}
                    >
                      {action.action}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Mark as Final */}
      {canMarkAsFinal && (
        <View style={styles.section}>
          <Pressable
            onPress={handleMarkAsFinal}
            disabled={updatingStatus}
            style={({ pressed }) => [
              styles.finalButton,
              {
                backgroundColor: ACCENT_COLOR,
                opacity: pressed || updatingStatus ? 0.7 : 1,
              },
            ]}
          >
            {updatingStatus ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                <Text style={styles.finalButtonText}>Mark as Final</Text>
              </>
            )}
          </Pressable>
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
  pdpCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  pdpTimeframe: {
    fontSize: 12,
  },
  finalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  finalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
