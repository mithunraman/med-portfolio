import { SetMetadata } from '@nestjs/common';

export const QUOTA_TYPE_KEY = 'quotaType';

/**
 * Mark an endpoint as consuming usage quota.
 * The type is recorded as the event category for analytics.
 *
 * @example @UseQuota('analysis')
 */
export const UseQuota = (type: string) => SetMetadata(QUOTA_TYPE_KEY, type);
