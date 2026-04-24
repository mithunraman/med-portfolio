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
 * Provides device identity headers sent on auth-mutating requests.
 */
export interface DeviceInfoProvider {
  getDeviceId(): Promise<string>;
  getDeviceName(): string;
  getOs?(): string | undefined;
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
}
