import type { QuotaStatus } from '@acme/shared';
import { UserRole } from '@acme/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { isErr } from '../common/utils/result.util';
import {
  SHORT_WINDOW_MS,
  getPlanForRole,
  getShortWindowStart,
  getWeeklyWindowReset,
  getWeeklyWindowStart,
} from '../config/quota.config';
import { IQuotaRepository, QUOTA_REPOSITORY } from './quota.repository.interface';

export interface QuotaExceededPayload {
  statusCode: 429;
  message: string;
  code: 'QUOTA_EXCEEDED';
  retryAfter: number;
  quota: QuotaStatus;
}

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(@Inject(QUOTA_REPOSITORY) private readonly repo: IQuotaRepository) {}

  /**
   * Check if user is within quota for both windows.
   * Returns the quota status if within limits.
   * Throws TooManyRequestsException payload if exceeded.
   */
  async checkQuota(userId: string, role: UserRole): Promise<QuotaStatus> {
    const userOid = new Types.ObjectId(userId);
    const plan = getPlanForRole(role);
    const now = new Date();

    // Rolling 4-hour window
    const shortStart = getShortWindowStart(now);
    const shortCountResult = await this.repo.countSince(userOid, shortStart);
    if (isErr(shortCountResult)) throw new Error(shortCountResult.error.message);
    const shortUsed = shortCountResult.value;

    // Fixed weekly window
    const weeklyStart = getWeeklyWindowStart(now);
    const weeklyCountResult = await this.repo.countSince(userOid, weeklyStart);
    if (isErr(weeklyCountResult)) throw new Error(weeklyCountResult.error.message);
    const weeklyUsed = weeklyCountResult.value;

    const status = await this.buildQuotaStatus(userOid, shortUsed, weeklyUsed, plan, now);

    // Check short window
    if (shortUsed >= plan.shortWindow) {
      const retryAfter = await this.getShortWindowRetryAfter(userOid, shortStart, now);
      return this.throwQuotaExceeded(retryAfter, status);
    }

    // Check weekly window
    if (weeklyUsed >= plan.weeklyWindow) {
      const resetAt = getWeeklyWindowReset(now);
      const retryAfter = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
      return this.throwQuotaExceeded(retryAfter, status);
    }

    return status;
  }

  /**
   * Record an expensive operation for quota tracking.
   */
  async recordEvent(
    userId: string,
    type: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const userOid = new Types.ObjectId(userId);
    const result = await this.repo.recordEvent(userOid, type, metadata);
    if (isErr(result)) {
      this.logger.warn(`Failed to record quota event for user ${userId}: ${result.error.message}`);
    }
  }

  /**
   * Get current quota status for display (e.g. init response).
   */
  async getQuotaStatus(userId: string, role: UserRole): Promise<QuotaStatus> {
    const userOid = new Types.ObjectId(userId);
    const plan = getPlanForRole(role);
    const now = new Date();

    const shortStart = getShortWindowStart(now);
    const shortCountResult = await this.repo.countSince(userOid, shortStart);
    const shortUsed = isErr(shortCountResult) ? 0 : shortCountResult.value;

    const weeklyStart = getWeeklyWindowStart(now);
    const weeklyCountResult = await this.repo.countSince(userOid, weeklyStart);
    const weeklyUsed = isErr(weeklyCountResult) ? 0 : weeklyCountResult.value;

    return this.buildQuotaStatus(userOid, shortUsed, weeklyUsed, plan, now);
  }

  private async buildQuotaStatus(
    userOid: Types.ObjectId,
    shortUsed: number,
    weeklyUsed: number,
    plan: { shortWindow: number; weeklyWindow: number },
    now: Date
  ): Promise<QuotaStatus> {
    // For rolling window: resetsAt = when the oldest event in the window expires
    let shortResetsAt: string | null = null;
    if (shortUsed > 0) {
      const shortStart = getShortWindowStart(now);
      const oldestResult = await this.repo.findOldestInWindow(userOid, shortStart);
      if (!isErr(oldestResult) && oldestResult.value) {
        const expiresAt = new Date(oldestResult.value.getTime() + SHORT_WINDOW_MS);
        shortResetsAt = expiresAt.toISOString();
      }
    }

    return {
      shortWindow: {
        used: shortUsed,
        limit: plan.shortWindow,
        resetsAt: shortResetsAt,
        windowType: 'rolling',
      },
      weeklyWindow: {
        used: weeklyUsed,
        limit: plan.weeklyWindow,
        resetsAt: getWeeklyWindowReset(now).toISOString(),
        windowType: 'fixed',
      },
    };
  }

  private async getShortWindowRetryAfter(
    userOid: Types.ObjectId,
    shortStart: Date,
    now: Date
  ): Promise<number> {
    const oldestResult = await this.repo.findOldestInWindow(userOid, shortStart);
    if (!isErr(oldestResult) && oldestResult.value) {
      const expiresAt = oldestResult.value.getTime() + SHORT_WINDOW_MS;
      return Math.max(1, Math.ceil((expiresAt - now.getTime()) / 1000));
    }
    return 1;
  }

  private throwQuotaExceeded(retryAfter: number, quota: QuotaStatus): never {
    const payload: QuotaExceededPayload = {
      statusCode: 429,
      message: 'Quota exceeded',
      code: 'QUOTA_EXCEEDED',
      retryAfter,
      quota,
    };
    const error = new Error('Quota exceeded') as any;
    error.response = payload;
    error.status = 429;
    throw error;
  }
}
