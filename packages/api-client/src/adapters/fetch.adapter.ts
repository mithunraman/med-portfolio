import type { HttpAdapter, HttpRequestConfig, HttpResponse } from './types';

/**
 * HTTP adapter using the Fetch API.
 * Suitable for web browsers and modern Node.js.
 */
export function createFetchAdapter(): HttpAdapter {
  return {
    async request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
      const { url, method, headers, body, timeout, signal } = config;

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;

      // Combine signals if both timeout and external signal exist
      const combinedSignal = signal || controller.signal;

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

        // Convert headers to plain object
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          data: data as T,
          status: response.status,
          headers: responseHeaders,
        };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
  };
}
