import { BANNER_HEIGHTS } from '@/components/bannerMetrics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBannerVisibility } from './useBannerVisibility';

/**
 * Returns the height of the active banner (including safe area).
 * Only one banner is shown at a time — priority matches ActiveBanner:
 * offline > deletion > recommendedUpdate > quota.
 * Used by KeyboardAvoidingView to adjust its offset.
 */
export function useBannerOffset(): number {
  const insets = useSafeAreaInsets();
  const { activeBanner } = useBannerVisibility();

  if (!activeBanner) return 0;

  return insets.top + BANNER_HEIGHTS[activeBanner];
}
