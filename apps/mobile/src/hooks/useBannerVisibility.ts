import type { ActiveBannerKind } from '@/components/bannerMetrics';
import { selectRecommendedUpdateBannerVisible } from '@/store';
import { selectBannerVisible, selectIsOffline } from '@/store/slices/networkSlice';
import { useAppSelector } from './useAppSelector';

interface BannerVisibility {
  offline: boolean;
  deletion: boolean;
  recommendedUpdate: boolean;
  quota: boolean;
  activeBanner: ActiveBannerKind | null;
}

/**
 * Single source of truth for which top banner is active.
 *
 * Priority matches ActiveBanner: offline > deletion > recommendedUpdate > quota.
 * Consumers: ActiveBanner (which banner to render), useOfflineAwareInsets
 * (whether to zero out insets.top), useBannerOffset (KeyboardAvoidingView).
 */
export function useBannerVisibility(): BannerVisibility {
  const isOffline = useAppSelector(selectIsOffline);
  const offlineBannerVisible = useAppSelector(selectBannerVisible);
  const deletionPending = useAppSelector((s) => !!s.auth.user?.deletionScheduledFor);
  const recommendedUpdate = useAppSelector(selectRecommendedUpdateBannerVisible);
  const quotaWarningVisible = useAppSelector((s) => {
    const q = s.auth.quota;
    if (!q) return false;
    const shortPercent = q.shortWindow.limit > 0 ? q.shortWindow.used / q.shortWindow.limit : 0;
    const weeklyPercent = q.weeklyWindow.limit > 0 ? q.weeklyWindow.used / q.weeklyWindow.limit : 0;
    return shortPercent >= 0.8 || weeklyPercent >= 0.8;
  });

  const offline = isOffline || offlineBannerVisible;

  let activeBanner: ActiveBannerKind | null = null;
  if (offline) activeBanner = 'offline';
  else if (deletionPending) activeBanner = 'deletion';
  else if (recommendedUpdate) activeBanner = 'recommendedUpdate';
  else if (quotaWarningVisible) activeBanner = 'quota';

  return {
    offline,
    deletion: deletionPending,
    recommendedUpdate,
    quota: quotaWarningVisible,
    activeBanner,
  };
}
