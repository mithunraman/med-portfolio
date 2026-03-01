import { useTheme } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';

export type StatusVariant = 'default' | 'processing' | 'warning' | 'success' | 'info';

const VARIANT_COLORS: Record<
  StatusVariant,
  { light: { bg: string; text: string }; dark: { bg: string; text: string } }
> = {
  default: {
    light: { bg: '#e8e8e8', text: '#666666' },
    dark: { bg: '#3a3a3a', text: '#aaaaaa' },
  },
  processing: {
    light: { bg: '#fff3cd', text: '#856404' },
    dark: { bg: '#4a3f1a', text: '#ffd966' },
  },
  warning: {
    light: { bg: '#fce4b8', text: '#8a6d3b' },
    dark: { bg: '#4a3a1a', text: '#f0c060' },
  },
  success: {
    light: { bg: '#d4edda', text: '#155724' },
    dark: { bg: '#1a3a22', text: '#7dce8c' },
  },
  info: {
    light: { bg: '#cce5ff', text: '#004085' },
    dark: { bg: '#1a2e4a', text: '#6db3f8' },
  },
};

interface StatusPillProps {
  label: string;
  variant?: StatusVariant;
}

export function StatusPill({ label, variant = 'default' }: StatusPillProps) {
  const { isDark } = useTheme();
  const scheme = isDark ? VARIANT_COLORS[variant].dark : VARIANT_COLORS[variant].light;

  return (
    <View style={[styles.pill, { backgroundColor: scheme.bg }]} accessibilityRole="text">
      <Text style={[styles.label, { color: scheme.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
