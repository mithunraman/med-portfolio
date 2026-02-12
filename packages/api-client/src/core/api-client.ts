import type { ApiClientConfig, HttpRequestConfig, HttpResponse } from '../adapters/types';
import { ApiError, UnauthorizedError, NetworkError, ValidationError } from './api-error';
import { generateRequestId } from './request-id';

interface RequestOptions extends Omit<HttpRequestConfig, 'url' | 'method'> {
  method?: HttpRequestConfig['method'];
  authenticated?: boolean;
  skipUnauthorizedCallback?: boolean;
}

type PublicRequestOptions = Pick<RequestOptions, 'authenticated' | 'skipUnauthorizedCallback'>;

/**
 * Base API client with dependency injection.
 * Platform-agnostic - consumers provide their own HTTP adapter and token storage.
 */
export class BaseApiClient {
  private readonly config: Required<ApiClientConfig>;

  constructor(config: ApiClientConfig) {
    this.config = {
      ...config,
      requestIdGenerator: config.requestIdGenerator || generateRequestId,
      onUnauthorized: config.onUnauthorized || (() => { }),
    };
  }

  /**
   * Make an authenticated API request.
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { authenticated = true, skipUnauthorizedCallback = false, ...requestOptions } = options;
    const requestId = this.config.requestIdGenerator();
    const url = `${this.config.baseUrl}${path}`;

    // Build headers
    const headers: Record<string, string> = {
      'x-request-id': requestId,
      ...requestOptions.headers,
    };

    // Add auth header if authenticated
    if (authenticated) {
      const token = await this.config.tokenProvider.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    let response: HttpResponse<unknown>;

    try {
      response = await this.config.httpAdapter.request<unknown>({
        ...requestOptions,
        method: requestOptions.method || 'GET',
        url,
        headers,
      });
    } catch (error) {
      // Network error (no response received)
      throw new NetworkError(
        'Network request failed',
        requestId,
        error instanceof Error ? error : undefined
      );
    }

    // Handle error responses
    if (response.status >= 400) {
      const errorData = response.data as { message?: string | string[]; code?: string } | null;

      if (response.status === 401) {
        if (!skipUnauthorizedCallback) {
          this.config.onUnauthorized();
        }
        throw new UnauthorizedError('Authentication required', requestId, response.status);
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
        errorData?.code || 'UNKNOWN'
      );
    }

    return response.data as T;
  }

  /**
   * GET request
   */
  get<T>(path: string, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'GET', ...options });
  }

  /**
   * POST request
   */
  post<T>(path: string, body: unknown, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, ...options });
  }

  /**
   * PUT request
   */
  put<T>(path: string, body: unknown, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body, ...options });
  }

  /**
   * PATCH request
   */
  patch<T>(path: string, body: unknown, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body, ...options });
  }

  /**
   * DELETE request
   */
  delete<T>(path: string, options?: PublicRequestOptions): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', ...options });
  }
}
