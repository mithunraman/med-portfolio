import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface SettingsItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
}

export function SettingsItem({
  icon,
  label,
  value,
  onPress,
  rightElement,
  showChevron = true,
}: SettingsItemProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.container, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={!onPress && !rightElement}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
    >
      <View style={styles.left}>
        <Ionicons name={icon} size={22} color={colors.textSecondary} style={styles.icon} />
        <View>
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
          {value && <Text style={[styles.value, { color: colors.textSecondary }]}>{value}</Text>}
        </View>
      </View>
      {rightElement ||
        (showChevron && onPress && (
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        ))}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: 12,
  },
  label: {
    fontSize: 16,
  },
  value: {
    fontSize: 13,
    marginTop: 2,
  },
});
