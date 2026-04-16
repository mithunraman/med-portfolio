import { useTheme } from '@/theme';
import { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';

interface SkeletonBoneProps {
  width: ViewStyle['width'];
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBone({ width, height, borderRadius = 4, style }: SkeletonBoneProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.border, opacity }, style]}
    />
  );
}
