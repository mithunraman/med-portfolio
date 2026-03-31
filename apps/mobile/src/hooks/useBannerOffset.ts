import { selectBannerVisible, selectIsOffline } from '@/store/slices/networkSlice';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppSelector } from './useAppSelector';

const BANNER_HEIGHT = 36;
const DELETION_BANNER_HEIGHT = 44;
const QUOTA_BANNER_HEIGHT = 36;

/**
 * Returns the height of the active banner (including safe area).
 * Only one banner is shown at a time (priority: offline > deletion > quota).
 * Used by KeyboardAvoidingView to adjust its offset.
 */
export function useBannerOffset(): number {
  const insets = useSafeAreaInsets();
  const isOffline = useAppSelector(selectIsOffline);
  const offlineBannerVisible = useAppSelector(selectBannerVisible);
  const deletionPending = useAppSelector((s) => !!s.auth.user?.deletionScheduledFor);
  const quotaWarningVisible = useAppSelector((s) => {
    const q = s.auth.quota;
    if (!q) return false;
    const shortPercent = q.shortWindow.limit > 0 ? q.shortWindow.used / q.shortWindow.limit : 0;
    const weeklyPercent = q.weeklyWindow.limit > 0 ? q.weeklyWindow.used / q.weeklyWindow.limit : 0;
    return shortPercent >= 0.8 || weeklyPercent >= 0.8;
  });

  // Same priority as ActiveBanner: offline > deletion > quota
  let bannerHeight = 0;
  if (isOffline || offlineBannerVisible) {
    bannerHeight = BANNER_HEIGHT;
  } else if (deletionPending) {
    bannerHeight = DELETION_BANNER_HEIGHT;
  } else if (quotaWarningVisible) {
    bannerHeight = QUOTA_BANNER_HEIGHT;
  }

  if (bannerHeight === 0) return 0;

  return insets.top + bannerHeight;
}
