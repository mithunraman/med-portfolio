import { StatusPill } from '@/components';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchArtefact, selectArtefactById, updateArtefactStatus } from '@/store';
import { useTheme } from '@/theme';
import { getArtefactStatusDisplay } from '@/utils/artefactStatus';
import { ArtefactStatus, PdpActionStatus } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACCENT_COLOR = '#00a884';

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
            <View key={index} style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.capabilityCode, { color: colors.primary }]}>{cap.name}</Text>
              <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
                {cap.evidence}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* PDP Actions (read-only) */}
      {artefact.pdpActions && artefact.pdpActions.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>PDP Actions</Text>
          {artefact.pdpActions.map((action) => (
            <View key={action.id} style={[styles.pdpRow, { backgroundColor: colors.surface }]}>
              <Ionicons
                name={
                  action.status === PdpActionStatus.COMPLETED ? 'checkbox' : 'square-outline'
                }
                size={22}
                color={
                  action.status === PdpActionStatus.COMPLETED
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <View style={styles.pdpContent}>
                <Text
                  style={[
                    styles.pdpText,
                    { color: colors.text },
                    action.status === PdpActionStatus.COMPLETED && styles.pdpCompleted,
                  ]}
                >
                  {action.action}
                </Text>
                <Text style={[styles.pdpTimeframe, { color: colors.textSecondary }]}>
                  {action.timeframe}
                </Text>
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
  capabilityCode: {
    fontSize: 14,
    fontWeight: '700',
  },
  pdpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  pdpContent: {
    flex: 1,
    gap: 2,
  },
  pdpText: {
    fontSize: 14,
    lineHeight: 20,
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
