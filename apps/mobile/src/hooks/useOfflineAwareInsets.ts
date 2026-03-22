import { selectBannerVisible } from '@/store/slices/networkSlice';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from './useAppSelector';

/**
 * Returns safe area insets with `top` adjusted for the offline banner.
 *
 * When the banner is visible (offline OR "back online" transition) it sits
 * above the Stack and already covers insets.top. Screens should not add
 * insets.top again, so this hook returns top: 0 while the banner is showing.
 */
export function useOfflineAwareInsets() {
  const insets = useSafeAreaInsets();
  const bannerVisible = useAppSelector(selectBannerVisible);

  return {
    ...insets,
    top: bannerVisible ? 0 : insets.top,
  };
}
