import { useAppSelector } from '@/hooks';
import { selectUpdatePolicy } from '@/store';
import { selectBannerVisible, selectIsOffline } from '@/store/slices/networkSlice';
import { UpdateStatus } from '@acme/shared';
import { DeletionBanner } from './DeletionBanner';
import { OfflineBanner } from './OfflineBanner';
import { QuotaWarningBanner } from './QuotaWarningBanner';
import { RecommendedUpdateBanner } from './RecommendedUpdateBanner';

/**
 * Renders at most one banner based on priority:
 * 1. Offline (app is broken)
 * 2. Deletion (irreversible action)
 * 3. Recommended update (actionable)
 * 4. Quota warning (informational)
 */
export function ActiveBanner() {
  const isOffline = useAppSelector(selectIsOffline);
  const offlineBannerVisible = useAppSelector(selectBannerVisible);
  const deletionPending = useAppSelector((s) => !!s.auth.user?.deletionScheduledFor);
  const updatePolicy = useAppSelector(selectUpdatePolicy);
  const hasRecommendedUpdate = updatePolicy?.status === UpdateStatus.RECOMMENDED;
  const quotaWarningVisible = useAppSelector((s) => {
    const q = s.auth.quota;
    if (!q) return false;
    const shortPercent = q.shortWindow.limit > 0 ? q.shortWindow.used / q.shortWindow.limit : 0;
    const weeklyPercent = q.weeklyWindow.limit > 0 ? q.weeklyWindow.used / q.weeklyWindow.limit : 0;
    return shortPercent >= 0.8 || weeklyPercent >= 0.8;
  });

  // Priority: offline > deletion > recommended update > quota
  if (isOffline || offlineBannerVisible) return <OfflineBanner />;
  if (deletionPending) return <DeletionBanner />;
  if (hasRecommendedUpdate && updatePolicy) return <RecommendedUpdateBanner updatePolicy={updatePolicy} />;
  if (quotaWarningVisible) return <QuotaWarningBanner />;

  return null;
}
