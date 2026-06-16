import { Feather } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme';

interface Props {
  hiddenCount: number;
  onPress: () => void;
}

/**
 * One-way "Show N more" affordance rendered below a collapsed option list.
 * Presentational only — collapse state lives in useCollapsibleOptions.
 */
export const ShowMoreRow = memo(function ShowMoreRow({ hiddenCount, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`Show ${hiddenCount} more options`}
    >
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Show {hiddenCount} more
      </Text>
      <Feather name="chevron-down" size={16} color={colors.textSecondary} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
