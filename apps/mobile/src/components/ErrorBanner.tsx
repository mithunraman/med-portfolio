import { useTheme } from '@/theme';
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}

export const ErrorBanner = memo(function ErrorBanner({
  message,
  onRetry,
  icon = 'warning-outline',
}: ErrorBannerProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: colors.error + '15' }]}
      accessibilityRole="alert"
    >
      <Ionicons name={icon} size={18} color={colors.error} style={styles.icon} />
      <Text style={[styles.message, { color: colors.error }]} numberOfLines={2}>
        {message}
      </Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={[styles.retryButton, { borderColor: colors.error + '40' }]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Text style={[styles.retryText, { color: colors.error }]}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginHorizontal: 24,
    marginBottom: 16,
  },
  icon: {
    marginRight: 8,
  },
  message: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
