import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 'default' — centred with generous padding, for full sections.
   *  'compact' — tighter padding, smaller text, for use inside cards. */
  variant?: 'default' | 'compact';
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  variant = 'default',
}: EmptyStateProps) {
  const { colors } = useTheme();
  const isCompact = variant === 'compact';

  return (
    <View
      style={[styles.container, isCompact ? styles.containerCompact : styles.containerDefault]}
      accessibilityRole="text"
    >
      {icon && (
        <Ionicons
          name={icon}
          size={isCompact ? 28 : 48}
          color={colors.textSecondary}
          style={isCompact ? styles.iconCompact : styles.icon}
        />
      )}
      <Text
        style={[
          styles.title,
          isCompact ? styles.titleCompact : styles.titleDefault,
          { color: colors.text },
        ]}
      >
        {title}
      </Text>
      {description && (
        <Text
          style={[
            styles.description,
            isCompact ? styles.descriptionCompact : styles.descriptionDefault,
            { color: colors.textSecondary },
          ]}
        >
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  containerDefault: {
    paddingVertical: 36,
  },
  containerCompact: {
    paddingVertical: 20,
  },
  icon: {
    marginBottom: 14,
    opacity: 0.5,
  },
  iconCompact: {
    marginBottom: 8,
    opacity: 0.5,
  },
  title: {
    fontWeight: '600',
    textAlign: 'center',
  },
  titleDefault: {
    fontSize: 17,
    marginBottom: 8,
  },
  titleCompact: {
    fontSize: 14,
    marginBottom: 4,
  },
  description: {
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  descriptionDefault: {
    fontSize: 14,
  },
  descriptionCompact: {
    fontSize: 13,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
