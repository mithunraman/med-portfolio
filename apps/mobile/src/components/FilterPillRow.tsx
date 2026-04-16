import { useTheme } from '@/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface FilterOption<T> {
  label: string;
  value: T | null;
}

interface FilterPillRowProps<T> {
  filters: FilterOption<T>[];
  activeFilter: T | null;
  onSelect: (value: T | null) => void;
}

export function FilterPillRow<T>({ filters, activeFilter, onSelect }: FilterPillRowProps<T>) {
  const { colors } = useTheme();

  return (
    <View style={styles.filterRow}>
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter.label}
          style={[
            styles.filterPill,
            {
              backgroundColor: activeFilter === filter.value ? colors.primary : colors.surface,
              borderColor: activeFilter === filter.value ? colors.primary : colors.border,
            },
          ]}
          onPress={() => onSelect(filter.value)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterPillText,
              { color: activeFilter === filter.value ? '#fff' : colors.text },
            ]}
          >
            {filter.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
