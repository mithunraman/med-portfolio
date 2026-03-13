import { useTheme } from '@/theme';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface EditableReflectionSectionProps {
  section: { title: string; text: string };
  editable: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
}

export function EditableReflectionSection({
  section,
  editable,
  expanded,
  onToggleExpand,
  onEdit,
}: EditableReflectionSectionProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {/* Section Title */}
      <Pressable onPress={onToggleExpand} style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
        <View style={styles.titleIcons}>
          {editable && (
            <Pressable onPress={onEdit} hitSlop={8}>
              <Feather name="edit-2" size={15} color={colors.primary} />
            </Pressable>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textSecondary}
          />
        </View>
      </Pressable>

      {/* Section Body */}
      {expanded && (
        <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
          {section.text}
        </Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  titleIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});
