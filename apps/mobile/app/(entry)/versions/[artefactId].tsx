import { Button, StatusPill } from '@/components';
import { useAppDispatch } from '@/hooks';
import { fetchVersionHistory, restoreVersion } from '@/store';
import { useTheme } from '@/theme';
import type { ArtefactVersion } from '@acme/shared';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

export default function VersionHistoryScreen() {
  const { artefactId } = useLocalSearchParams<{ artefactId: string }>();
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [versions, setVersions] = useState<ArtefactVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<ArtefactVersion | null>(null);

  useEffect(() => {
    if (!artefactId) return;

    setLoading(true);
    dispatch(fetchVersionHistory({ artefactId }))
      .unwrap()
      .then((response) => {
        setVersions(response.versions);
      })
      .catch(() => {
        Alert.alert('Error', 'Failed to load version history.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [artefactId, dispatch]);

  const handleRestore = useCallback(
    (version: ArtefactVersion) => {
      if (!artefactId) return;

      Alert.alert(
        'Restore version',
        `Restore to version ${version.version}? Your current content will be saved as a new version.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: async () => {
              setRestoring(true);
              const result = await dispatch(
                restoreVersion({ artefactId, version: version.version })
              );
              setRestoring(false);

              if (restoreVersion.fulfilled.match(result)) {
                setSelectedVersion(null);
                router.back();
              } else {
                Alert.alert('Error', 'Failed to restore version.');
              }
            },
          },
        ]
      );
    },
    [artefactId, dispatch, router]
  );

  const renderVersionRow = useCallback(
    ({ item }: { item: ArtefactVersion }) => (
      <Pressable
        onPress={() => setSelectedVersion(item)}
        style={[styles.versionRow, { backgroundColor: colors.surface }]}
      >
        <View style={styles.versionRowLeft}>
          <View style={styles.versionBadge}>
            <Feather name="git-commit" size={16} color={colors.primary} />
            <Text style={[styles.versionLabel, { color: colors.text }]}>
              Version {item.version}
            </Text>
          </View>
          <Text style={[styles.versionTimestamp, { color: colors.textSecondary }]}>
            {formatTimestamp(item.timestamp)}
          </Text>
          {item.title && (
            <Text
              style={[styles.versionTitle, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>
    ),
    [colors]
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (versions.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No version history yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={versions}
        keyExtractor={(item) => String(item.version)}
        renderItem={renderVersionRow}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* Version Preview Modal */}
      <Modal
        visible={selectedVersion !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedVersion(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContainer,
              { backgroundColor: colors.background, paddingBottom: insets.bottom + 24 },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Version {selectedVersion?.version}
              </Text>
              <Pressable onPress={() => setSelectedVersion(null)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.modalTimestamp, { color: colors.textSecondary }]}>
              {selectedVersion && formatTimestamp(selectedVersion.timestamp)}
            </Text>

            {/* Preview Content */}
            <ScrollView style={styles.modalBody}>
              {selectedVersion?.title && (
                <View style={styles.previewSection}>
                  <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Title</Text>
                  <Text style={[styles.previewText, { color: colors.text }]}>
                    {selectedVersion.title}
                  </Text>
                </View>
              )}

              {selectedVersion?.reflection && selectedVersion.reflection.length > 0 && (
                <View style={styles.previewSection}>
                  <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                    Reflection
                  </Text>
                  {selectedVersion.reflection.map((section, index) => (
                    <View key={index} style={[styles.previewCard, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.previewCardTitle, { color: colors.text }]}>
                        {section.title}
                      </Text>
                      <Text style={[styles.previewCardBody, { color: colors.textSecondary }]}>
                        {section.text}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            {/* Restore Button */}
            <View style={styles.restoreButtonContainer}>
              <Button
                label="Restore this version"
                onPress={() => selectedVersion && handleRestore(selectedVersion)}
                loading={restoring}
                icon={(color) => <Feather name="rotate-ccw" size={18} color={color} />}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 15,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 14,
  },
  versionRowLeft: {
    flex: 1,
    gap: 4,
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  versionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  versionTimestamp: {
    fontSize: 13,
  },
  versionTitle: {
    fontSize: 13,
    fontStyle: 'italic',
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
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalTimestamp: {
    fontSize: 13,
    marginBottom: 16,
  },
  modalBody: {
    flexGrow: 0,
    marginBottom: 16,
  },
  previewSection: {
    marginBottom: 16,
    gap: 8,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewText: {
    fontSize: 16,
    fontWeight: '600',
  },
  previewCard: {
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  previewCardTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  previewCardBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  restoreButtonContainer: {
    paddingTop: 8,
  },
});
