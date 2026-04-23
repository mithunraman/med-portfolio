import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ANIMATION_DURATION_MS = 250;

/**
 * Animated collapse/expand for top-of-screen banners.
 * Fills the safe-area inset at the top so the colored background extends behind the status bar.
 *
 * Returns a style object ready to spread onto an <Animated.View>.
 */
export function useBannerAnimation(visible: boolean, bannerHeight: number, backgroundColor: string) {
  const insets = useSafeAreaInsets();
  // Start matched to the initial `visible` so a banner mounting already-visible doesn't
  // animate from 0 → full on first paint (e.g. user opens app while offline).
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: ANIMATION_DURATION_MS,
      useNativeDriver: false,
    }).start();
  }, [visible, anim]);

  const totalHeight = insets.top + bannerHeight;

  return {
    height: anim.interpolate({ inputRange: [0, 1], outputRange: [0, totalHeight] }),
    paddingTop: anim.interpolate({ inputRange: [0, 1], outputRange: [0, insets.top] }),
    // Fade color to transparent during collapse so the shrinking strip doesn't flash a solid color.
    backgroundColor: visible ? backgroundColor : 'transparent',
    overflow: 'hidden' as const,
  };
}
