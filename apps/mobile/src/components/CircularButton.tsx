import { memo, useCallback, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

// ============================================================================
// TYPES
// ============================================================================

interface CircularButtonProps {
  /** The icon to render inside the button */
  icon: React.ReactNode;
  /** Background color of the button */
  backgroundColor: string;
  /** Called when the button is pressed */
  onPress: () => void;
  /** Accessibility label for screen readers */
  accessibilityLabel: string;
  /** Test ID for testing */
  testID?: string;
  /** Size of the button (width and height) */
  size?: number;
  /** Border color (optional) */
  borderColor?: string;
  /** Border width (default: 0) */
  borderWidth?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SIZE = 48;

// ============================================================================
// COMPONENT
// ============================================================================

export const CircularButton = memo(function CircularButton({
  icon,
  backgroundColor,
  onPress,
  accessibilityLabel,
  testID,
  size = DEFAULT_SIZE,
  borderColor,
  borderWidth = 0,
}: CircularButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [scaleAnim]);

  const buttonStyle = useMemo(
    () => [
      styles.circularButton,
      {
        backgroundColor,
        width: size,
        height: size,
        borderRadius: size / 2,
        transform: [{ scale: scaleAnim }],
        ...(borderColor && { borderColor, borderWidth }),
      },
    ],
    [backgroundColor, size, scaleAnim, borderColor, borderWidth]
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      hitSlop={4}
    >
      <Animated.View style={buttonStyle}>{icon}</Animated.View>
    </Pressable>
  );
});

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  circularButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CircularButton;
