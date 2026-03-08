import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';

const ACCENT_COLOR = '#00a884';

interface CompletionCardProps {
  icon: ReactNode;
  heading: string;
  supportText: string;
  subtitle?: string | null;
  buttonLabel: string;
  buttonIcon?: ReactNode;
  onPress: () => void;
}

export const CompletionCard = memo(function CompletionCard({
  icon,
  heading,
  supportText,
  subtitle,
  buttonLabel,
  buttonIcon,
  onPress,
}: CompletionCardProps) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? colors.surface : colors.background,
          borderTopColor: colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: ACCENT_COLOR }]}>{icon}</View>
        <View style={styles.headerText}>
          <Text style={[styles.heading, { color: colors.text }]}>{heading}</Text>
          <Text style={[styles.supportText, { color: colors.textSecondary }]}>{supportText}</Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: ACCENT_COLOR, opacity: pressed ? 0.85 : 1 },
        ]}
        accessibilityLabel={buttonLabel}
        accessibilityRole="button"
      >
        {buttonIcon}
        <Text style={styles.buttonLabel}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
  },
  supportText: {
    fontSize: 13,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
