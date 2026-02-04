export class ApiError extends Error {
  public readonly requestId: string;
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, requestId: string, status: number, code: string = 'UNKNOWN') {
    super(message);
    this.name = 'ApiError';
    this.requestId = requestId;
    this.status = status;
    this.code = code;
  }
}

export class NetworkError extends ApiError {
  public readonly cause?: Error;

  constructor(message: string, requestId: string, cause?: Error) {
    super(message, requestId, 0, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string, requestId: string, status: number = 401) {
    super(message, requestId, status, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ValidationError extends ApiError {
  public readonly errors: unknown;

  constructor(message: string | string[], requestId: string, status: number, errors?: unknown) {
    const msg = Array.isArray(message) ? message.join(', ') : message;
    super(msg, requestId, status, 'VALIDATION_FAILED');
    this.name = 'ValidationError';
    this.errors = errors;
  }

  getFieldErrors(): Record<string, string> {
    if (this.errors && typeof this.errors === 'object' && 'errors' in this.errors) {
      return (this.errors as { errors: Record<string, string> }).errors;
    }
    return {};
  }
}
