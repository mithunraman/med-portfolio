import { UserRole } from '@acme/shared';
import {
  getPlanForRole,
  getShortWindowStart,
  getWeeklyWindowReset,
  getWeeklyWindowStart,
} from '../../config/quota.config';

describe('quota.config', () => {
  describe('getShortWindowStart', () => {
    it('should return now minus 4 hours', () => {
      const now = new Date('2026-03-30T14:30:00Z');
      const start = getShortWindowStart(now);
      expect(start.toISOString()).toBe('2026-03-30T10:30:00.000Z');
    });

    it('should handle midnight crossing', () => {
      const now = new Date('2026-03-30T02:00:00Z');
      const start = getShortWindowStart(now);
      expect(start.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    });
  });

  describe('getWeeklyWindowStart', () => {
    it('should return this Monday 7 AM for mid-week', () => {
      // Wednesday 3 PM
      const now = new Date('2026-04-01T15:00:00Z'); // Wednesday
      const start = getWeeklyWindowStart(now);
      expect(start.getUTCDay()).toBe(1); // Monday
      expect(start.getUTCHours()).toBe(7);
      expect(start.toISOString()).toBe('2026-03-30T07:00:00.000Z');
    });

    it('should return previous Monday 7 AM if before Monday 7 AM', () => {
      // Monday 6:59 AM
      const now = new Date('2026-03-30T06:59:00Z');
      const start = getWeeklyWindowStart(now);
      expect(start.toISOString()).toBe('2026-03-23T07:00:00.000Z');
    });

    it('should return this Monday 7 AM if after Monday 7 AM', () => {
      // Monday 7:01 AM
      const now = new Date('2026-03-30T07:01:00Z');
      const start = getWeeklyWindowStart(now);
      expect(start.toISOString()).toBe('2026-03-30T07:00:00.000Z');
    });

    it('should return this Monday 7 AM on Sunday', () => {
      // Sunday 11 PM
      const now = new Date('2026-04-05T23:00:00Z'); // Sunday
      const start = getWeeklyWindowStart(now);
      expect(start.getUTCDay()).toBe(1); // Monday
      expect(start.toISOString()).toBe('2026-03-30T07:00:00.000Z');
    });

    it('should return this Monday 7 AM exactly at Monday 7 AM', () => {
      const now = new Date('2026-03-30T07:00:00.000Z');
      const start = getWeeklyWindowStart(now);
      expect(start.toISOString()).toBe('2026-03-30T07:00:00.000Z');
    });
  });

  describe('getWeeklyWindowReset', () => {
    it('should return next Monday 7 AM', () => {
      // Wednesday
      const now = new Date('2026-04-01T15:00:00Z');
      const reset = getWeeklyWindowReset(now);
      expect(reset.getUTCDay()).toBe(1); // Monday
      expect(reset.getUTCHours()).toBe(7);
      expect(reset.toISOString()).toBe('2026-04-06T07:00:00.000Z');
    });

    it('should return next Monday from Sunday', () => {
      const now = new Date('2026-04-05T23:00:00Z'); // Sunday
      const reset = getWeeklyWindowReset(now);
      expect(reset.toISOString()).toBe('2026-04-06T07:00:00.000Z');
    });
  });

  describe('getPlanForRole', () => {
    it('should return guest limits for USER_GUEST', () => {
      const plan = getPlanForRole(UserRole.USER_GUEST);
      expect(plan.shortWindow).toBe(20);
      expect(plan.weeklyWindow).toBe(100);
    });

    it('should return registered limits for USER', () => {
      const plan = getPlanForRole(UserRole.USER);
      expect(plan.shortWindow).toBe(40);
      expect(plan.weeklyWindow).toBe(200);
    });

    it('should fallback to guest limits for unknown role', () => {
      const plan = getPlanForRole(999 as UserRole);
      expect(plan.shortWindow).toBe(20);
      expect(plan.weeklyWindow).toBe(100);
    });
  });
});
