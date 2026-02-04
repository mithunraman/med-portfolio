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
 * Token provider interface for auth header injection.
 * Allows different storage mechanisms (localStorage, SecureStore, etc.)
 */
export interface TokenProvider {
  getAccessToken(): Promise<string | null>;
  setAccessToken(token: string): Promise<void>;
  clearAccessToken(): Promise<void>;
}

/**
 * Configuration for creating an API client instance.
 */
export interface ApiClientConfig {
  baseUrl: string;
  httpAdapter: HttpAdapter;
  tokenProvider: TokenProvider;
  requestIdGenerator?: () => string;
  onUnauthorized?: () => void;
}
