import { useTheme } from '@/theme';
import type { LinkedArtefactRef } from '@acme/shared';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SkeletonBone } from './SkeletonBone';

/**
 * Artefact titles are nullable. Deliberately not the old single-row copy
 * ('View entry'): with several rows that reads identically for every untitled
 * entry, leaving a screen-reader user nothing to tell them apart.
 */
const UNTITLED_ENTRY = 'Untitled entry';

/**
 * Why a status rather than booleans: `entries === undefined` carries three
 * meanings — not requested yet, in flight, and settled-but-failed — and they must
 * render differently. A single union makes the impossible combinations
 * (loading *and* failed) unrepresentable.
 */
export type LinkedEntriesStatus = 'loading' | 'failed' | 'idle';

interface LinkedEntriesListProps {
  /**
   * `undefined` means not loaded — only the detail endpoint returns links, so a
   * goal read from a list has none yet. `[]` means genuinely none. The two must
   * not render alike, or an unloaded goal claims it has no entries.
   */
  entries: LinkedArtefactRef[] | undefined;
  status: LinkedEntriesStatus;
  onRetry: () => void;
  onSelectEntry: (entryId: string) => void;
}

/**
 * The entries that evidence a goal.
 *
 * Renders 0, 1 or many. Zero is not an error state — a goal outlives every entry
 * that cites it, so deleting the entry it came from leaves the goal here with an
 * empty list rather than removing the goal.
 */
export function LinkedEntriesList({
  entries,
  status,
  onRetry,
  onSelectEntry,
}: LinkedEntriesListProps) {
  const { colors } = useTheme();

  // Links we already hold win over a failed refresh — stale citations are more
  // useful than an error, and the goal's own data is on screen regardless.
  if (entries === undefined) {
    if (status === 'loading') {
      return <SkeletonBone width="60%" height={14} style={styles.skeleton} />;
    }

    if (status === 'failed') {
      return (
        <View style={styles.row}>
          <Ionicons
            name="alert-circle-outline"
            size={13}
            color={colors.warning}
            style={styles.icon}
          />
          {/* Never the empty-state copy here: we do not know there are no
              entries, only that we failed to read them. */}
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            Couldn&apos;t load linked entries
          </Text>
          <TouchableOpacity onPress={onRetry} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.retry, { color: colors.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Not requested yet — one frame, before the screen's effect dispatches.
    return null;
  }

  if (entries.length === 0) {
    return <Text style={[styles.empty, { color: colors.textSecondary }]}>No linked entries</Text>;
  }

  return (
    <View style={styles.list}>
      {entries.map((entry) => {
        const title = entry.title ?? UNTITLED_ENTRY;
        return (
          <TouchableOpacity
            key={entry.id}
            style={styles.row}
            onPress={() => onSelectEntry(entry.id)}
            accessibilityRole="button"
            accessibilityLabel={`View entry: ${title}`}
          >
            <Ionicons
              name="document-text-outline"
              size={13}
              color={colors.textSecondary}
              style={styles.icon}
            />
            <Text style={[styles.title, { color: colors.textSecondary }]} numberOfLines={2}>
              {title}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={13}
              color={colors.textSecondary}
              style={styles.icon}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  title: {
    fontSize: 12,
    flexShrink: 1,
  },
  icon: {
    marginTop: 1,
  },
  empty: {
    fontSize: 12,
  },
  retry: {
    fontSize: 12,
    fontWeight: '600',
  },
  skeleton: {
    marginTop: 8,
  },
});
