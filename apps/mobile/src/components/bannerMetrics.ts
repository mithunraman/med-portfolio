export const OFFLINE_BANNER_HEIGHT = 36;
export const DELETION_BANNER_HEIGHT = 44;
export const RECOMMENDED_UPDATE_BANNER_HEIGHT = 36;
export const QUOTA_BANNER_HEIGHT = 36;

export type ActiveBannerKind = 'offline' | 'deletion' | 'recommendedUpdate' | 'quota';

export const BANNER_HEIGHTS: Record<ActiveBannerKind, number> = {
  offline: OFFLINE_BANNER_HEIGHT,
  deletion: DELETION_BANNER_HEIGHT,
  recommendedUpdate: RECOMMENDED_UPDATE_BANNER_HEIGHT,
  quota: QUOTA_BANNER_HEIGHT,
};
