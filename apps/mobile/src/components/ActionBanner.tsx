import { Feather } from '@expo/vector-icons';
import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../theme';

const ACCENT_COLOR = '#00a884';

interface ActionBannerProps {
  variant: 'analyse' | 'continue';
  onPress: () => void;
  isLoading?: boolean;
}

export const ActionBanner = memo(function ActionBanner({
  variant,
  onPress,
  isLoading = false,
}: ActionBannerProps) {
  const { colors, isDark } = useTheme();

  const label = variant === 'analyse' ? 'Start Analysis' : 'Continue Analysis';
  const icon = variant === 'analyse' ? 'play-circle' : 'arrow-right-circle';

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
      <Pressable
        onPress={onPress}
        disabled={isLoading}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: ACCENT_COLOR, opacity: pressed ? 0.85 : 1 },
          isLoading && styles.buttonDisabled,
        ]}
        accessibilityLabel={label}
        accessibilityRole="button"
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <>
            <Feather name={icon} size={18} color="#ffffff" />
            <Text style={styles.label}>{label}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
