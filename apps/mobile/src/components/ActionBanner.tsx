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
  /** Blocked state — greyed out with helper text, no spinner. Distinct from isLoading. */
  disabled?: boolean;
  helperText?: string;
}

export const ActionBanner = memo(function ActionBanner({
  variant,
  onPress,
  isLoading = false,
  disabled = false,
  helperText,
}: ActionBannerProps) {
  const { colors, isDark } = useTheme();

  const label = variant === 'analyse' ? 'Start Analysis' : 'Continue Analysis';
  const icon = variant === 'analyse' ? 'play-circle' : 'arrow-right-circle';
  const isDisabled = isLoading || disabled;

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
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: ACCENT_COLOR, opacity: pressed ? 0.85 : 1 },
          isLoading && styles.buttonLoading,
          disabled && !isLoading && styles.buttonBlocked,
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
      {disabled && !isLoading && helperText ? (
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>{helperText}</Text>
      ) : null}
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
  buttonLoading: {
    opacity: 0.6,
  },
  buttonBlocked: {
    opacity: 0.4,
  },
  label: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
