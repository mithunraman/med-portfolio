import { HttpStatus } from '@nestjs/common';
import { EmailLockoutService, TooManyVerifyAttemptsException } from '../email-lockout.service';

describe('EmailLockoutService', () => {
  let service: EmailLockoutService;

  beforeEach(() => {
    service = new EmailLockoutService();
  });

  describe('checkLockout', () => {
    it('should allow first attempt for unknown email', () => {
      expect(() => service.checkLockout('user@example.com')).not.toThrow();
    });

    it('should allow attempts below threshold', () => {
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');

      expect(() => service.checkLockout('user@example.com')).not.toThrow();
    });

    it('should throw 429 after reaching failure threshold', () => {
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');

      expect(() => service.checkLockout('user@example.com')).toThrow(
        TooManyVerifyAttemptsException
      );
    });

    it('should return 429 status code', () => {
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');

      try {
        service.checkLockout('user@example.com');
        fail('Expected exception');
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });

    it('should allow access after lockout expires', () => {
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');

      // Simulate time passing beyond lockout duration (10 minutes)
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 10 * 60 * 1000 + 1);

      expect(() => service.checkLockout('user@example.com')).not.toThrow();

      jest.restoreAllMocks();
    });

    it('should still be locked before duration expires', () => {
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');

      // Simulate time passing, but not enough
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 5 * 60 * 1000);

      expect(() => service.checkLockout('user@example.com')).toThrow(
        TooManyVerifyAttemptsException
      );

      jest.restoreAllMocks();
    });
  });

  describe('clearLockout', () => {
    it('should reset state after successful verify', () => {
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');

      service.clearLockout('user@example.com');

      expect(() => service.checkLockout('user@example.com')).not.toThrow();
    });
  });

  describe('email normalization', () => {
    it('should treat different cases as the same email', () => {
      service.recordFailure('User@Example.COM');
      service.recordFailure('user@example.com');
      service.recordFailure('USER@EXAMPLE.COM');

      expect(() => service.checkLockout('user@example.com')).toThrow(
        TooManyVerifyAttemptsException
      );
    });
  });

  describe('isolation', () => {
    it('should track emails independently', () => {
      service.recordFailure('a@example.com');
      service.recordFailure('a@example.com');
      service.recordFailure('a@example.com');

      expect(() => service.checkLockout('a@example.com')).toThrow(
        TooManyVerifyAttemptsException
      );
      expect(() => service.checkLockout('b@example.com')).not.toThrow();
    });
  });

  describe('error message', () => {
    it('should include remaining minutes in message', () => {
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');
      service.recordFailure('user@example.com');

      try {
        service.checkLockout('user@example.com');
        fail('Expected exception');
      } catch (e: any) {
        expect(e.message).toMatch(/try again in \d+ minutes/);
      }
    });
  });
});
