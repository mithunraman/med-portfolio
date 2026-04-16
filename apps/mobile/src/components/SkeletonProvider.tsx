import { createContext, useContext, useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export const SKELETON_OPACITY_MIN = 0.3;
export const SKELETON_OPACITY_MAX = 0.7;
export const SKELETON_PULSE_DURATION = 800;

const SkeletonContext = createContext<Animated.Value | null>(null);

export function SkeletonProvider({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(SKELETON_OPACITY_MIN)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: SKELETON_OPACITY_MAX,
          duration: SKELETON_PULSE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: SKELETON_OPACITY_MIN,
          duration: SKELETON_PULSE_DURATION,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <SkeletonContext.Provider value={opacity}>{children}</SkeletonContext.Provider>;
}

export function useSkeletonOpacity() {
  return useContext(SkeletonContext);
}
