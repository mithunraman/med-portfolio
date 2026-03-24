import { useTheme } from '@/theme';
import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  showLabel?: boolean;
}

export const StepIndicator = memo(function StepIndicator({
  currentStep,
  totalSteps,
  showLabel = true,
}: StepIndicatorProps) {
  const { colors } = useTheme();
  const fillAnim = useRef(new Animated.Value(0)).current;

  const progress = Math.min(currentStep / totalSteps, 1);

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: progress,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [fillAnim, progress]);

  const fillWidth = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityValue={{ now: currentStep, min: 1, max: totalSteps }}>
      {showLabel && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Step {currentStep} of {totalSteps}
        </Text>
      )}
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <Animated.View style={[styles.fill, { width: fillWidth, backgroundColor: colors.primary }]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
});
