import { UserRole } from '@acme/shared';
import { Types } from 'mongoose';
import { ok } from '../../common/utils/result.util';
import { quotaPlans } from '../../config/quota.config';
import { QuotaService } from '../quota.service';

// ── Helpers ──

const guestPlan = quotaPlans[UserRole.USER_GUEST];
const userPlan = quotaPlans[UserRole.USER];
const userId = new Types.ObjectId();
const userIdStr = userId.toString();

function createMockRepo() {
  return {
    countSince: jest.fn().mockResolvedValue(ok(0)),
    recordEvent: jest.fn().mockResolvedValue(ok(undefined)),
    findOldestInWindow: jest.fn().mockResolvedValue(ok(null)),
  };
}

function createService(repo = createMockRepo()) {
  return { service: new QuotaService(repo as any), repo };
}

// ── Tests ──

describe('QuotaService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('checkQuota', () => {
    it('should pass when under both limits', async () => {
      const { service, repo } = createService();
      repo.countSince
        .mockResolvedValueOnce(ok(5)) // short window
        .mockResolvedValueOnce(ok(10)); // weekly window

      const status = await service.checkQuota(userIdStr, UserRole.USER);

      expect(status.shortWindow.used).toBe(5);
      expect(status.shortWindow.limit).toBe(userPlan.shortWindow);
      expect(status.weeklyWindow.used).toBe(10);
      expect(status.weeklyWindow.limit).toBe(userPlan.weeklyWindow);
    });

    it('should throw 429 when short window exceeded', async () => {
      const { service, repo } = createService();
      const oldestDate = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
      repo.countSince
        .mockResolvedValueOnce(ok(userPlan.shortWindow)) // short window at limit
        .mockResolvedValueOnce(ok(50)); // weekly under limit
      repo.findOldestInWindow.mockResolvedValue(ok(oldestDate));

      try {
        await service.checkQuota(userIdStr, UserRole.USER);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBe(429);
        expect(error.response.code).toBe('QUOTA_EXCEEDED');
        expect(error.response.retryAfter).toBeGreaterThan(0);
        expect(error.response.quota.shortWindow.used).toBe(userPlan.shortWindow);
      }
    });

    it('should throw 429 when weekly window exceeded', async () => {
      const { service, repo } = createService();
      repo.countSince
        .mockResolvedValueOnce(ok(10)) // short window under
        .mockResolvedValueOnce(ok(userPlan.weeklyWindow)); // weekly at limit

      try {
        await service.checkQuota(userIdStr, UserRole.USER);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBe(429);
        expect(error.response.code).toBe('QUOTA_EXCEEDED');
        expect(error.response.quota.weeklyWindow.used).toBe(userPlan.weeklyWindow);
      }
    });

    it('should use guest limits for USER_GUEST', async () => {
      const { service, repo } = createService();
      repo.countSince
        .mockResolvedValueOnce(ok(guestPlan.shortWindow)) // short window at guest limit
        .mockResolvedValueOnce(ok(30)); // weekly under

      try {
        await service.checkQuota(userIdStr, UserRole.USER_GUEST);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.status).toBe(429);
        expect(error.response.quota.shortWindow.limit).toBe(guestPlan.shortWindow);
      }
    });

    it('should pass for registered user at guest limit', async () => {
      const { service, repo } = createService();
      repo.countSince
        .mockResolvedValueOnce(ok(guestPlan.shortWindow)) // at guest limit but under registered
        .mockResolvedValueOnce(ok(30));

      const status = await service.checkQuota(userIdStr, UserRole.USER);

      expect(status.shortWindow.used).toBe(guestPlan.shortWindow);
      expect(status.shortWindow.limit).toBe(userPlan.shortWindow);
    });
  });

  describe('recordEvent', () => {
    it('should call repo.recordEvent with correct args', async () => {
      const { service, repo } = createService();

      await service.recordEvent(userIdStr, 'analysis', { conversationId: 'conv-123' });

      expect(repo.recordEvent).toHaveBeenCalledWith(expect.any(Types.ObjectId), 'analysis', {
        conversationId: 'conv-123',
      });
    });
  });

  describe('getQuotaStatus', () => {
    it('should return correct status for both windows', async () => {
      const { service, repo } = createService();
      repo.countSince
        .mockResolvedValueOnce(ok(12)) // short
        .mockResolvedValueOnce(ok(85)); // weekly

      const status = await service.getQuotaStatus(userIdStr, UserRole.USER);

      expect(status.shortWindow.used).toBe(12);
      expect(status.shortWindow.limit).toBe(userPlan.shortWindow);
      expect(status.shortWindow.windowType).toBe('rolling');
      expect(status.weeklyWindow.used).toBe(85);
      expect(status.weeklyWindow.limit).toBe(userPlan.weeklyWindow);
      expect(status.weeklyWindow.windowType).toBe('fixed');
      expect(status.weeklyWindow.resetsAt).toBeDefined();
    });

    it('should return zero usage for new user', async () => {
      const { service } = createService();

      const status = await service.getQuotaStatus(userIdStr, UserRole.USER);

      expect(status.shortWindow.used).toBe(0);
      expect(status.weeklyWindow.used).toBe(0);
    });
  });
});
