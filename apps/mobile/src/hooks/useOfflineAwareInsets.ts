import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBannerVisibility } from './useBannerVisibility';

/**
 * Returns safe area insets with `top` adjusted for top banners.
 *
 * When any top banner is visible (offline, deletion, recommended update, or
 * quota warning) it sits above the Stack and already covers insets.top, so
 * screens should not add insets.top again.
 */
export function useOfflineAwareInsets() {
  const insets = useSafeAreaInsets();
  const { activeBanner } = useBannerVisibility();

  return useMemo(
    () => ({
      ...insets,
      top: activeBanner ? 0 : insets.top,
    }),
    [insets, activeBanner]
  );
}
