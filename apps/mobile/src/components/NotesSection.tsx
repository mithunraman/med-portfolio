import { useTheme } from '@/theme';
import { formatTimeAgo } from '@/utils/formatTimeAgo';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const DELETE_COLOR = '#dc3545';

// A note as held in the screen's local edit buffer. Persisted notes carry an
// xid + server timestamps; an unsaved draft has neither until the save reconcile
// mints them, so a draft gets a client-side clientId for stable identity.
export interface LocalNote {
  xid?: string;
  text: string;
  createdAt?: string;
  updatedAt?: string;
  clientId?: string;
}

// Stable identity for a note — its server xid, else the client draft id. Notes
// are addressed by this key (not list position) so a re-sort or a sibling draft
// can't misalign an in-flight edit/delete. Mirrors the capability editor keying
// on `code` rather than index.
export function noteKey(note: LocalNote): string {
  return note.xid ?? note.clientId ?? '';
}

interface NotesSectionProps {
  notes: LocalNote[];
  editable: boolean;
  onAddNote: () => void;
  onEditNote: (key: string) => void;
  onDeleteNote: (key: string) => void;
}

/**
 * Presentational notes list — renders the count header, top "Add" affordance,
 * truncated cards (newest-first ordering is the caller's concern), per-card
 * delete, and an empty state. State-free: all data and actions come via props.
 */
export function NotesSection({
  notes,
  editable,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: NotesSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          Notes{notes.length > 0 ? ` · ${notes.length}` : ''}
        </Text>
        {editable && (
          <Pressable onPress={onAddNote} hitSlop={8} style={styles.addButton}>
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={[styles.addLabel, { color: colors.primary }]}>Add</Text>
          </Pressable>
        )}
      </View>

      {notes.length === 0 ? (
        <Pressable
          onPress={editable ? onAddNote : undefined}
          style={[styles.emptyCard, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {editable
              ? 'No notes yet - add anything that came up after this entry was created.'
              : 'No notes.'}
          </Text>
        </Pressable>
      ) : (
        notes.map((note) => {
          const key = noteKey(note);
          return (
            <Pressable
              key={key}
              onPress={editable ? () => onEditNote(key) : undefined}
              disabled={!editable}
              style={[styles.card, { backgroundColor: colors.surface }]}
            >
              <View style={styles.cardRow}>
                <Text style={[styles.cardText, { color: colors.text }]} numberOfLines={3}>
                  {note.text}
                </Text>
                {editable && (
                  <Pressable
                    onPress={() => onDeleteNote(key)}
                    hitSlop={8}
                    style={styles.trashButton}
                  >
                    <Feather name="trash-2" size={16} color={DELETE_COLOR} />
                  </Pressable>
                )}
              </View>
              {note.updatedAt && (
                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                  Edited {formatTimeAgo(note.updatedAt)}
                </Text>
              )}
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  addLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyCard: {
    borderRadius: 12,
    padding: 16,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  trashButton: {
    marginLeft: 12,
    paddingTop: 1,
  },
  meta: {
    fontSize: 12,
  },
});
