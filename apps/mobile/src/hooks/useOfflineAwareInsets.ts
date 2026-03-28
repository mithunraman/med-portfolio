import { selectBannerVisible } from '@/store/slices/networkSlice';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from './useAppSelector';

/**
 * Returns safe area insets with `top` adjusted for top banners.
 *
 * When any top banner is visible (offline, back-online, or deletion) it sits
 * above the Stack and already covers insets.top. Screens should not add
 * insets.top again, so this hook returns top: 0 while a banner is showing.
 */
export function useOfflineAwareInsets() {
  const insets = useSafeAreaInsets();
  const offlineBannerVisible = useAppSelector(selectBannerVisible);
  const deletionPending = useAppSelector((s) => !!s.auth.user?.deletionScheduledFor);

  return {
    ...insets,
    top: offlineBannerVisible || deletionPending ? 0 : insets.top,
  };
}
