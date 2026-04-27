/**
 * Platform-agnostic HTTP adapter interface.
 * Consumers inject their own implementation (fetch, axios, ky, etc.)
 */
export interface HttpAdapter {
  request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
}

export interface HttpRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  signal?: AbortSignal;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

/**
 * Token provider interface for access + refresh token storage.
 * Allows different storage mechanisms (localStorage, SecureStore, etc.)
 */
export interface TokenProvider {
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  setTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  clearTokens(): Promise<void>;
}

/**
 * Provides device identity headers sent on every request.
 * Returns a flat header map so the api-client doesn't need to know which
 * platform-specific fields are present (e.g. web may omit `x-os`).
 */
export interface DeviceInfoProvider {
  getDeviceHeaders(): Promise<Record<string, string>>;
}

/**
 * Configuration for creating an API client instance.
 */
export interface QuotaHeaders {
  shortUsed: number;
  shortLimit: number;
  shortReset: string | null;
  weeklyUsed: number;
  weeklyLimit: number;
  weeklyReset: string | null;
}

export interface ApiClientConfig {
  baseUrl: string;
  httpAdapter: HttpAdapter;
  tokenProvider: TokenProvider;
  deviceInfoProvider?: DeviceInfoProvider;
  requestIdGenerator?: () => string;
  onUnauthorized?: () => void;
  onQuotaUpdate?: (quota: QuotaHeaders) => void;
  appVersion?: string;
  platform?: string;
  /**
   * Seconds before access-token expiry at which the client fires a proactive
   * refresh. Default: 60. Lower this if access tokens are short-lived; raise
   * if you want to amortise refresh chatter.
   */
  proactiveRefreshBufferSeconds?: number;
}
