import { useTheme } from '@/theme';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface EditableReflectionSectionProps {
  section: { title: string; text: string; covered?: boolean };
  editable: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  // Hint shown in the empty state when editable. Defaults to the section-oriented
  // copy; callers reusing this card for other content (e.g. capabilities) override it.
  emptyHint?: string;
}

export function EditableReflectionSection({
  section,
  editable,
  expanded,
  onToggleExpand,
  onEdit,
  emptyHint,
}: EditableReflectionSectionProps) {
  const { colors } = useTheme();
  const isEmpty = section.covered === false || section.text.trim().length === 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {/* Section header — NHS accordion layout: the whole heading (chevron on the
          leading edge + title) is the expand toggle; the edit action is a separate,
          isolated 44pt target on the far right so the two can't be mis-tapped. */}
      <View style={styles.cardHeader}>
        <Pressable
          onPress={onToggleExpand}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={section.title}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
          <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
        </Pressable>
        {editable && (
          <Pressable
            onPress={onEdit}
            style={styles.editButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${section.title}`}
          >
            <Feather name="edit-2" size={16} color={colors.primary} />
          </Pressable>
        )}
      </View>

      {/* Section Body */}
      {expanded && (
        isEmpty ? (
          <Pressable onPress={editable ? onEdit : undefined} style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {editable
                ? (emptyHint ?? `Tap to add your thoughts on ${section.title}`)
                : 'No content for this section'}
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
            {section.text}
          </Text>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Whole-heading toggle: chevron (leading) + title. Kept compact; the wide row
  // is still a comfortable expand target.
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  // Compact edit icon; `hitSlop` extends the touch area to ≥44pt (WCAG 2.5.8 / HIG).
  editButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
});
