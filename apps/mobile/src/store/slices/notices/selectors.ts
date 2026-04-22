import { NoticeType, UpdateStatus } from '@acme/shared';
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../index';

export const selectUpdatePolicy = (state: RootState) => state.notices.updatePolicy;

export const selectHasMandatoryUpdate = (state: RootState) =>
  state.notices.updatePolicy?.status === UpdateStatus.MANDATORY;

const selectDismissedUpdateVersion = (state: RootState) => state.notices.dismissedUpdateVersion;
const selectDismissedUpdateHydrated = (state: RootState) => state.notices.dismissedUpdateHydrated;

export const selectRecommendedUpdateBannerVisible = createSelector(
  selectUpdatePolicy,
  selectDismissedUpdateVersion,
  selectDismissedUpdateHydrated,
  (updatePolicy, dismissedVersion, hydrated) => {
    if (!hydrated) return false;
    if (updatePolicy?.status !== UpdateStatus.RECOMMENDED) return false;
    return dismissedVersion !== updatePolicy.latestVersion;
  }
);

const selectNotices = (state: RootState) => state.notices.notices;

export const selectBannerNotice = createSelector(selectNotices, (notices) =>
  notices.find((n) => n.type === NoticeType.BANNER) ?? null
);

export const selectModalNotice = createSelector(selectNotices, (notices) =>
  notices.find((n) => n.type === NoticeType.MODAL) ?? null
);
