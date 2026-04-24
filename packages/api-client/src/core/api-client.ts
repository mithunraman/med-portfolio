import type {
  ApiClientConfig,
  DeviceInfoProvider,
  HttpRequestConfig,
  HttpResponse,
} from '../adapters/types';
import { ApiError, NetworkError, UnauthorizedError, ValidationError } from './api-error';
import { generateRequestId } from './request-id';

interface RequestOptions extends Omit<HttpRequestConfig, 'url' | 'method'> {
  method?: HttpRequestConfig['method'];
  authenticated?: boolean;
  skipUnauthorizedCallback?: boolean;
  skipRefresh?: boolean;
}

type PublicRequestOptions = Pick<
  RequestOptions,
  'authenticated' | 'skipUnauthorizedCallback' | 'skipRefresh'
>;

const AUTH_ERROR_CODES = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  REFRESH_INVALID: 'REFRESH_INVALID',
  USER_INACTIVE: 'USER_INACTIVE',
} as const;

// Auth failures that mean "refresh won't help — force logout."
const UNRECOVERABLE_CODES = new Set<string>([
  AUTH_ERROR_CODES.TOKEN_INVALID,
  AUTH_ERROR_CODES.SESSION_REVOKED,
  AUTH_ERROR_CODES.SESSION_EXPIRED,
  AUTH_ERROR_CODES.SESSION_NOT_FOUND,
  AUTH_ERROR_CODES.REFRESH_INVALID,
  AUTH_ERROR_CODES.USER_INACTIVE,
]);

const PROACTIVE_REFRESH_BUFFER_SECONDS = 60;

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * Platform-agnostic base API client.
 * Handles auth header injection, proactive + reactive refresh with single-flight coordination,
 * and device identity headers for auth-mutating requests.
 */
export class BaseApiClient {
  private readonly config: Required<
    Omit<ApiClientConfig, 'appVersion' | 'platform' | 'deviceInfoProvider'>
  > &
    Pick<ApiClientConfig, 'appVersion' | 'platform' | 'deviceInfoProvider'>;

  private refreshPromise: Promise<RefreshResult> | null = null;

  constructor(config: ApiClientConfig) {
    this.config = {
      ...config,
      requestIdGenerator: config.requestIdGenerator || generateRequestId,
      onUnauthorized: config.onUnauthorized || (() => {}),
      onQuotaUpdate: config.onQuotaUpdate || (() => {}),
    };
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const {
      authenticated = true,
      skipUnauthorizedCallback = false,
      skipRefresh = false,
      ...requestOptions
    } = options;

    // Proactive refresh: refresh before firing if the token is near expiry.
    if (authenticated && !skipRefresh) {
      await this.maybeProactiveRefresh();
    }

    const requestId = this.config.requestIdGenerator();
    const url = `${this.config.baseUrl}${path}`;
    const headers = await this.buildHeaders(requestOptions.headers, authenticated, requestId);

    let response: HttpResponse<unknown>;
    try {
      response = await this.config.httpAdapter.request<unknown>({
        ...requestOptions,
        method: requestOptions.method || 'GET',
        url,
        headers,
      });
    } catch (error) {
      throw new NetworkError(
        'Network request failed',
        requestId,
        error instanceof Error ? error : undefined
      );
    }

    // Reactive refresh on 401 TOKEN_EXPIRED — retry once.
    if (
      response.status === 401 &&
      authenticated &&
      !skipRefresh &&
      this.is401WithCode(response, AUTH_ERROR_CODES.TOKEN_EXPIRED)
    ) {
      try {
        await this.refreshTokens();
      } catch {
        this.triggerUnauthorized(skipUnauthorizedCallback);
        throw new UnauthorizedError('Session expired', requestId, 401);
      }

      const retryHeaders = await this.buildHeaders(
        requestOptions.headers,
        authenticated,
        requestId
      );
      response = await this.config.httpAdapter.request<unknown>({
        ...requestOptions,
        method: requestOptions.method || 'GET',
        url,
        headers: retryHeaders,
      });
    }

    if (response.status >= 400) {
      this.throwForErrorResponse(response, requestId, skipUnauthorizedCallback);
    }

    this.syncQuotaHeaders(response);
    return response.data as T;
  }

  get<T>(path: string, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'GET', ...options });
  }
  post<T>(path: string, body: unknown, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, ...options });
  }
  put<T>(path: string, body: unknown, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body, ...options });
  }
  patch<T>(path: string, body: unknown, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body, ...options });
  }
  delete<T>(path: string, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', ...options });
  }

  // ── Headers ──

  private async buildHeaders(
    base: Record<string, string> | undefined,
    authenticated: boolean,
    requestId: string
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'x-request-id': requestId,
      ...base,
    };

    if (this.config.appVersion) headers['x-app-version'] = this.config.appVersion;
    if (this.config.platform) headers['x-platform'] = this.config.platform;

    if (this.config.deviceInfoProvider) {
      await this.attachDeviceHeaders(headers, this.config.deviceInfoProvider);
    }

    if (authenticated) {
      const token = await this.config.tokenProvider.getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private async attachDeviceHeaders(
    headers: Record<string, string>,
    provider: DeviceInfoProvider
  ): Promise<void> {
    const deviceId = await provider.getDeviceId();
    if (deviceId) headers['x-device-id'] = deviceId;
    const deviceName = provider.getDeviceName();
    if (deviceName) headers['x-device-name'] = deviceName;
    const os = provider.getOs?.();
    if (os) headers['x-os'] = os;
  }

  // ── Refresh ──

  private async maybeProactiveRefresh(): Promise<void> {
    const token = await this.config.tokenProvider.getAccessToken();
    if (!token) return;
    const exp = decodeJwtExp(token);
    if (exp === null) return;
    const secondsUntilExpiry = exp - Math.floor(Date.now() / 1000);
    if (secondsUntilExpiry > PROACTIVE_REFRESH_BUFFER_SECONDS) return;

    try {
      await this.refreshTokens();
    } catch {
      // Let the request proceed — the reactive path will handle a 401 if needed.
    }
  }

  private refreshTokens(): Promise<RefreshResult> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<RefreshResult> {
    const refreshToken = await this.config.tokenProvider.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const result = await this.request<RefreshResult>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      authenticated: false,
      skipRefresh: true,
      skipUnauthorizedCallback: true,
    });

    await this.config.tokenProvider.setTokens({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return result;
  }

  // ── Error handling ──

  private is401WithCode(response: HttpResponse<unknown>, code: string): boolean {
    if (response.status !== 401) return false;
    const data = response.data as { code?: string } | null;
    return data?.code === code;
  }

  private throwForErrorResponse(
    response: HttpResponse<unknown>,
    requestId: string,
    skipUnauthorizedCallback: boolean
  ): never {
    const errorData = response.data as { message?: string | string[]; code?: string } | null;
    const code = errorData?.code;

    if (response.status === 401) {
      if (code && UNRECOVERABLE_CODES.has(code)) {
        this.triggerUnauthorized(skipUnauthorizedCallback);
      } else if (!skipUnauthorizedCallback) {
        this.config.onUnauthorized();
      }
      throw new UnauthorizedError(
        typeof errorData?.message === 'string' ? errorData.message : 'Authentication required',
        requestId,
        response.status
      );
    }

    if (response.status === 422 || response.status === 400) {
      throw new ValidationError(
        errorData?.message || 'Validation failed',
        requestId,
        response.status,
        errorData
      );
    }

    throw new ApiError(
      typeof errorData?.message === 'string' ? errorData.message : 'An error occurred',
      requestId,
      response.status,
      code || 'UNKNOWN'
    );
  }

  private triggerUnauthorized(skip: boolean): void {
    if (skip) return;
    // Clear tokens before signaling — ensures the next boot sees no credentials.
    void this.config.tokenProvider.clearTokens();
    this.config.onUnauthorized();
  }

  // ── Quota ──

  private syncQuotaHeaders(response: HttpResponse<unknown>): void {
    const shortUsed = response.headers['x-quota-short-used'];
    if (!shortUsed) return;
    this.config.onQuotaUpdate({
      shortUsed: Number(shortUsed),
      shortLimit: Number(response.headers['x-quota-short-limit'] ?? 0),
      shortReset: response.headers['x-quota-short-reset'] || null,
      weeklyUsed: Number(response.headers['x-quota-weekly-used'] ?? 0),
      weeklyLimit: Number(response.headers['x-quota-weekly-limit'] ?? 0),
      weeklyReset: response.headers['x-quota-weekly-reset'] || null,
    });
  }
}

/**
 * Minimal JWT `exp` reader — avoids pulling in a JWT library just to read the expiry.
 * Returns the `exp` claim as a Unix timestamp (seconds), or null if unreadable.
 */
function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf-8');
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === 'number' ? parsed.exp : null;
  } catch {
    return null;
  }
}
