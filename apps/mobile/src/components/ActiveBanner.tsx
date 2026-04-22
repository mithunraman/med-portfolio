import { useAppSelector, useBannerVisibility } from '@/hooks';
import { selectUpdatePolicy } from '@/store';
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
  const { activeBanner } = useBannerVisibility();
  const updatePolicy = useAppSelector(selectUpdatePolicy);

  switch (activeBanner) {
    case 'offline':
      return <OfflineBanner />;
    case 'deletion':
      return <DeletionBanner />;
    case 'recommendedUpdate':
      return updatePolicy ? <RecommendedUpdateBanner updatePolicy={updatePolicy} /> : null;
    case 'quota':
      return <QuotaWarningBanner />;
    default:
      return null;
  }
}
