import { useTheme } from '@/theme';
import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type ButtonVariant = 'filled' | 'outline' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Visual style of the button. Defaults to 'filled'. */
  variant?: ButtonVariant;
  /**
   * Colour used for the background (filled), border (outline), or text/icon (ghost).
   * Defaults to the theme primary colour.
   */
  color?: string;
  /** Render prop — receives the resolved foreground colour so the icon stays in sync. */
  icon?: (color: string) => React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const Button = memo(function Button({
  label,
  onPress,
  variant = 'filled',
  color,
  icon,
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const { colors } = useTheme();

  const resolvedColor = color ?? colors.primary;
  const isDisabled = disabled || loading;

  const containerStyle: StyleProp<ViewStyle>[] = [styles.container];
  if (variant === 'filled') {
    containerStyle.push({ backgroundColor: resolvedColor });
  } else if (variant === 'outline') {
    containerStyle.push({ borderWidth: 1, borderColor: resolvedColor });
  }
  // ghost has no background or border

  const foregroundColor = variant === 'filled' ? '#ffffff' : resolvedColor;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [...containerStyle, { opacity: pressed || isDisabled ? 0.5 : 1 }, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foregroundColor} />
      ) : (
        <>
          {icon?.(foregroundColor)}
          <Text style={[styles.label, { color: foregroundColor }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
