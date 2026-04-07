import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

interface LockoutEntry {
  failedAttempts: number;
  lockedUntil: number | null;
}

@Injectable()
export class EmailLockoutService {
  private readonly logger = new Logger(EmailLockoutService.name);
  private readonly cache: LRUCache<string, LockoutEntry>;

  private readonly MAX_FAILURES = 3;
  private readonly LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 minutes
  private readonly CACHE_MAX = 10_000;
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.cache = new LRUCache<string, LockoutEntry>({
      max: this.CACHE_MAX,
      ttl: this.CACHE_TTL_MS,
    });
  }

  checkLockout(email: string): void {
    const key = email.toLowerCase();
    const entry = this.cache.get(key);
    if (!entry?.lockedUntil) return;

    const remainingMs = entry.lockedUntil - Date.now();
    if (remainingMs <= 0) {
      this.cache.delete(key);
      return;
    }

    const remainingMin = Math.ceil(remainingMs / 60_000);
    throw new TooManyVerifyAttemptsException(remainingMin);
  }

  recordFailure(email: string): void {
    const key = email.toLowerCase();
    const entry = this.cache.get(key) ?? { failedAttempts: 0, lockedUntil: null };

    entry.failedAttempts += 1;

    if (entry.failedAttempts >= this.MAX_FAILURES) {
      entry.lockedUntil = Date.now() + this.LOCKOUT_DURATION_MS;
      this.logger.warn(`Email ${key} locked out for 10 minutes after ${entry.failedAttempts} failed attempts`);
    }

    this.cache.set(key, entry);
  }

  clearLockout(email: string): void {
    this.cache.delete(email.toLowerCase());
  }
}

import { HttpException, HttpStatus } from '@nestjs/common';

export class TooManyVerifyAttemptsException extends HttpException {
  constructor(remainingMinutes: number) {
    super(
      `Too many failed attempts. Please try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}
