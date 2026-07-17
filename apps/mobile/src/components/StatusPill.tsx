import { useTheme } from '@/theme';
import { STATUS_COLORS, type StatusVariant } from '@/theme/statusColors';
import { StyleSheet, Text, View } from 'react-native';

// Re-exported so existing `@/components/StatusPill` import paths keep working.
export type { StatusVariant };

interface StatusPillProps {
  label: string;
  variant?: StatusVariant;
  /** Tighter padding + smaller text, for dense contexts like list rows. */
  compact?: boolean;
}

export function StatusPill({ label, variant = 'default', compact = false }: StatusPillProps) {
  const { isDark } = useTheme();
  const scheme = STATUS_COLORS[isDark ? 'dark' : 'light'][variant];

  return (
    <View
      style={[styles.pill, compact && styles.pillCompact, { backgroundColor: scheme.surface }]}
      accessibilityRole="text"
    >
      <Text style={[styles.label, compact && styles.labelCompact, { color: scheme.text }]}>
        {label}
      </Text>
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
  pillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  labelCompact: {
    fontSize: 11,
  },
});
