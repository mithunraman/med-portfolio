import { NoticeType, UpdateStatus } from '@acme/shared';
import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../index';

export const selectUpdatePolicy = (state: RootState) => state.notices.updatePolicy;

export const selectHasMandatoryUpdate = (state: RootState) =>
  state.notices.updatePolicy?.status === UpdateStatus.MANDATORY;

const selectNotices = (state: RootState) => state.notices.notices;

export const selectBannerNotice = createSelector(selectNotices, (notices) =>
  notices.find((n) => n.type === NoticeType.BANNER) ?? null
);

export const selectModalNotice = createSelector(selectNotices, (notices) =>
  notices.find((n) => n.type === NoticeType.MODAL) ?? null
);
