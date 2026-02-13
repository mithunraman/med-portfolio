import { type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

interface FloatingActionButtonProps {
  /** Icon to display (e.g., from @expo/vector-icons) */
  icon: ReactNode;
  /** Optional label text displayed next to the icon */
  label?: string;
  /** Press handler */
  onPress: () => void;
  /** Optional background color override (defaults to theme primary) */
  color?: string;
  /** Optional style overrides for positioning */
  style?: ViewStyle;
  /** Test ID for testing */
  testID?: string;
}

export function FloatingActionButton({
  icon,
  label,
  onPress,
  color,
  style,
  testID,
}: FloatingActionButtonProps) {
  const { colors } = useTheme();

  const backgroundColor = color ?? colors.primary;

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor }, style]}
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
    >
      <View style={styles.content}>
        {icon}
        {label && <Text style={styles.label}>{label}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
