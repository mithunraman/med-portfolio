import { useTheme } from '@/theme';
import { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import {
  SKELETON_OPACITY_MAX,
  SKELETON_OPACITY_MIN,
  SKELETON_PULSE_DURATION,
  useSkeletonOpacity,
} from './SkeletonProvider';

interface SkeletonBoneProps {
  width: ViewStyle['width'];
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBone({ width, height, borderRadius = 4, style }: SkeletonBoneProps) {
  const { colors } = useTheme();
  const sharedOpacity = useSkeletonOpacity();
  const localOpacity = useRef(new Animated.Value(SKELETON_OPACITY_MIN)).current;

  useEffect(() => {
    if (sharedOpacity) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(localOpacity, {
          toValue: SKELETON_OPACITY_MAX,
          duration: SKELETON_PULSE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(localOpacity, {
          toValue: SKELETON_OPACITY_MIN,
          duration: SKELETON_PULSE_DURATION,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [sharedOpacity, localOpacity]);

  const opacity = sharedOpacity ?? localOpacity;

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.border, opacity }, style]}
    />
  );
}
