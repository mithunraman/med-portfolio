import { createApiClient, type HttpAdapter, type TokenProvider } from '@acme/api-client';
import * as SecureStore from 'expo-secure-store';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const apiLogger = logger.createScope('API');

/**
 * Mobile token provider using Expo SecureStore.
 */
const mobileTokenProvider: TokenProvider = {
  async getAccessToken() {
    return SecureStore.getItemAsync('accessToken');
  },
  async setAccessToken(token: string) {
    await SecureStore.setItemAsync('accessToken', token);
  },
  async clearAccessToken() {
    await SecureStore.deleteItemAsync('accessToken');
  },
};

/**
 * React Native HTTP adapter.
 */
function createRNHttpAdapter(): HttpAdapter {
  return {
    async request(config) {
      const { url, method, headers, body, timeout } = config;

      const controller = new AbortController();
      const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;

      apiLogger.debug('Request', { method, url });

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        const data = await response.json().catch(() => null);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value: string, key: string) => {
          responseHeaders[key] = value;
        });

        apiLogger.debug('Response', { method, url, status: response.status });

        return { data, status: response.status, headers: responseHeaders };
      } catch (error) {
        apiLogger.error('Request failed', { method, url, error: String(error) });
        throw error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    },
  };
}

// Store for unauthorized callback
let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void) {
  onUnauthorizedCallback = callback;
}

/**
 * Singleton API client instance for mobile.
 */
export const api = createApiClient({
  baseUrl: env.EXPO_PUBLIC_API_URL,
  httpAdapter: createRNHttpAdapter(),
  tokenProvider: mobileTokenProvider,
  onUnauthorized: () => {
    onUnauthorizedCallback?.();
  },
});

export { mobileTokenProvider };
