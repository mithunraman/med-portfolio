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
  const quotaWarningVisible = useAppSelector((s) => {
    const q = s.auth.quota;
    if (!q) return false;
    const shortPercent = q.shortWindow.limit > 0 ? q.shortWindow.used / q.shortWindow.limit : 0;
    const weeklyPercent = q.weeklyWindow.limit > 0 ? q.weeklyWindow.used / q.weeklyWindow.limit : 0;
    return shortPercent >= 0.8 || weeklyPercent >= 0.8;
  });

  const anyBannerVisible = offlineBannerVisible || deletionPending || quotaWarningVisible;

  return {
    ...insets,
    top: anyBannerVisible ? 0 : insets.top,
  };
}
