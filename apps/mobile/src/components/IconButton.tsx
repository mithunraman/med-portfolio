import { memo, useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// ============================================================================
// TYPES
// ============================================================================

interface IconButtonProps {
  /** The icon to render inside the button */
  icon: React.ReactNode;
  /** Called when the button is pressed */
  onPress?: () => void;
  /** Called when press starts */
  onPressIn?: (e: GestureResponderEvent) => void;
  /** Called when press ends */
  onPressOut?: (e: GestureResponderEvent) => void;
  /** Accessibility label for screen readers */
  accessibilityLabel: string;
  /** Size of the touch target (width and height) */
  size?: number;
  /** Additional styles */
  style?: StyleProp<ViewStyle>;
  /** Visual active state */
  isActive?: boolean;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  testID?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SIZE = 44;

// ============================================================================
// COMPONENT
// ============================================================================

export const IconButton = memo(function IconButton({
  icon,
  onPress,
  onPressIn,
  onPressOut,
  accessibilityLabel,
  size = DEFAULT_SIZE,
  style,
  isActive = false,
  disabled = false,
  testID,
}: IconButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      Animated.spring(scaleAnim, {
        toValue: 0.9,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }).start();
      onPressIn?.(e);
    },
    [onPressIn, scaleAnim]
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }).start();
      onPressOut?.(e);
    },
    [onPressOut, scaleAnim]
  );

  const animatedStyle = useMemo(
    () => [
      styles.iconButton,
      { width: size, height: size, borderRadius: size / 2 },
      isActive && styles.iconButtonActive,
      disabled && styles.iconButtonDisabled,
      { transform: [{ scale: scaleAnim }] },
      style,
    ],
    [size, isActive, disabled, scaleAnim, style]
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
      hitSlop={4}
    >
      <Animated.View style={animatedStyle}>{icon}</Animated.View>
    </Pressable>
  );
});

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  iconButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
});

export default IconButton;
