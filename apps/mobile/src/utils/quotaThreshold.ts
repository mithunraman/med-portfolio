import type { QuotaStatus, QuotaWindow } from '@acme/shared';

export const QUOTA_WARNING_THRESHOLD = 0.8;

function percent(window: QuotaWindow): number {
  return window.limit > 0 ? window.used / window.limit : 0;
}

/**
 * Returns the quota window that's most urgent (highest usage %) if any window is
 * at or over the warning threshold, otherwise null.
 */
export function getUrgentQuotaWindow(
  quota: QuotaStatus | null
): { window: QuotaWindow; percent: number } | null {
  if (!quota) return null;

  const shortPercent = percent(quota.shortWindow);
  const weeklyPercent = percent(quota.weeklyWindow);

  if (shortPercent < QUOTA_WARNING_THRESHOLD && weeklyPercent < QUOTA_WARNING_THRESHOLD) {
    return null;
  }

  return shortPercent >= weeklyPercent
    ? { window: quota.shortWindow, percent: shortPercent }
    : { window: quota.weeklyWindow, percent: weeklyPercent };
}
