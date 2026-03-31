import { useAppSelector } from '@/hooks';
import { selectBannerVisible, selectIsOffline } from '@/store/slices/networkSlice';
import { DeletionBanner } from './DeletionBanner';
import { OfflineBanner } from './OfflineBanner';
import { QuotaWarningBanner } from './QuotaWarningBanner';

/**
 * Renders at most one banner based on priority:
 * 1. Offline (app is broken)
 * 2. Deletion (irreversible action)
 * 3. Quota warning (informational)
 */
export function ActiveBanner() {
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

  // Priority: offline > deletion > quota
  if (isOffline || offlineBannerVisible) return <OfflineBanner />;
  if (deletionPending) return <DeletionBanner />;
  if (quotaWarningVisible) return <QuotaWarningBanner />;

  return null;
}
