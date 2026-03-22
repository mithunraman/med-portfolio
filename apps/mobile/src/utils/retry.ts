import { ApiError, NetworkError } from '@acme/api-client';
import { backOff } from 'exponential-backoff';

export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }
  return false;
}

/** Retry config for write operations (send message, save, etc.) */
export function retryWrite<T>(fn: () => Promise<T>): Promise<T> {
  return backOff(fn, {
    numOfAttempts: 4,
    startingDelay: 1000,
    maxDelay: 5000,
    jitter: 'full',
    retry: isRetryableError,
  });
}

/** Retry config for read operations (fetch dashboard, list entries, etc.) */
export function retryRead<T>(fn: () => Promise<T>): Promise<T> {
  return backOff(fn, {
    numOfAttempts: 3,
    startingDelay: 500,
    maxDelay: 3000,
    jitter: 'full',
    retry: isRetryableError,
  });
}
