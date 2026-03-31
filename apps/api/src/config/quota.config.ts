import { UserRole } from '@acme/shared';

/**
 * Usage quota plans by user role.
 * Controls how many expensive operations a user can perform per window.
 */
export const quotaPlans: Record<number, { shortWindow: number; weeklyWindow: number }> = {
  [UserRole.USER_GUEST]: { shortWindow: 20, weeklyWindow: 100 },
  [UserRole.USER]: { shortWindow: 40, weeklyWindow: 200 },
  // Future: [UserRole.PAID]: { shortWindow: 100, weeklyWindow: 800 },
};

/** Rolling short window duration: 4 hours */
export const SHORT_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Rolling 4-hour window start: now minus 4 hours.
 */
export function getShortWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - SHORT_WINDOW_MS);
}

/**
 * Fixed weekly window start: last Monday 7:00 AM UTC.
 * If now is before Monday 7 AM, returns the previous Monday 7 AM.
 */
export function getWeeklyWindowStart(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(7, 0, 0, 0);

  // Walk back to Monday (getUTCDay: 0=Sun, 1=Mon)
  const day = d.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);

  // If we haven't reached this Monday 7 AM yet, go back one week
  if (d.getTime() > now.getTime()) {
    d.setUTCDate(d.getUTCDate() - 7);
  }

  return d;
}

/**
 * Next Monday 7:00 AM UTC (for user-facing reset display).
 */
export function getWeeklyWindowReset(now = new Date()): Date {
  const start = getWeeklyWindowStart(now);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * Resolve quota plan for a user role. Falls back to guest limits.
 */
export function getPlanForRole(role: UserRole) {
  return quotaPlans[role] ?? quotaPlans[UserRole.USER_GUEST];
}
