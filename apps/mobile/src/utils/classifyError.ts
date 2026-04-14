import { ApiError, NetworkError } from '@acme/api-client';

export type ErrorKind = 'network' | 'server' | 'unknown';

export interface TypedError {
  kind: ErrorKind;
  message: string;
  status?: number;
  retryable: boolean;
}

export function classifyError(error: unknown): TypedError {
  if (error instanceof NetworkError) {
    return { kind: 'network', message: 'No internet connection', retryable: true };
  }
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return { kind: 'server', message: 'Server error — try again shortly', status: error.status, retryable: true };
    }
    // 408 Request Timeout and 429 Too Many Requests are retryable; other 4xx are not
    const retryable = error.status === 408 || error.status === 429;
    return { kind: 'unknown', message: error.message, status: error.status, retryable };
  }
  return {
    kind: 'unknown',
    message: error instanceof Error ? error.message : 'Something went wrong',
    retryable: true,
  };
}
