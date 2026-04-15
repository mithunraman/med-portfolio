import { useTheme } from '@/theme';
import type { TypedError } from '@/utils/classifyError';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface FetchErrorBannerProps {
  error: TypedError | null;
  onRetry: () => void;
  onDismiss: () => void;
}

export function FetchErrorBanner({ error, onRetry, onDismiss }: FetchErrorBannerProps) {
  const { colors } = useTheme();

  if (!error) return null;

  const message =
    error.kind === 'network'
      ? 'Couldn\u2019t refresh. Check your connection.'
      : error.message ?? 'Something went wrong.';

  return (
    <View style={[styles.container, { backgroundColor: `${colors.error}15` }]}>
      <Text style={[styles.message, { color: colors.error }]} numberOfLines={2}>
        {message}
      </Text>
      <TouchableOpacity onPress={onRetry} hitSlop={8} accessibilityRole="button">
        <Text style={[styles.retry, { color: colors.primary }]}>Retry</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} hitSlop={8} accessibilityRole="button">
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 10,
  },
  message: {
    flex: 1,
    fontSize: 13,
  },
  retry: {
    fontSize: 13,
    fontWeight: '600',
  },
});
