import type { HttpAdapter, HttpRequestConfig, HttpResponse } from './types';

export interface FetchAdapterLogger {
  debug(message: string, context: Record<string, unknown>): void;
  error(message: string, context: Record<string, unknown>): void;
}

export interface FetchAdapterOptions {
  /**
   * Optional logger. Mobile plugs in its structured logger here; web can omit.
   */
  logger?: FetchAdapterLogger;
}

/**
 * HTTP adapter using the Fetch API.
 * Suitable for web browsers and React Native.
 */
export function createFetchAdapter(options: FetchAdapterOptions = {}): HttpAdapter {
  const logger = options.logger;

  return {
    async request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
      const { url, method, headers, body, timeout, signal } = config;

      const controller = new AbortController();
      const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;
      const combinedSignal = signal || controller.signal;

      logger?.debug('Request', { method, url });

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: combinedSignal,
        });

        const data = await response.json().catch(() => null);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        logger?.debug('Response', { method, url, status: response.status });

        return {
          data: data as T,
          status: response.status,
          headers: responseHeaders,
        };
      } catch (error) {
        logger?.error('Request failed', { method, url, error: String(error) });
        throw error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
  };
}
