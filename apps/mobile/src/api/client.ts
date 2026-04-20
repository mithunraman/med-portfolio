import {
  createApiClient,
  type HttpAdapter,
  type QuotaHeaders,
  type TokenProvider,
} from '@acme/api-client';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const apiLogger = logger.createScope('API');

/**
 * In-memory token cache to avoid native bridge calls on every API request.
 * SecureStore is only read on cold start; mutations keep the cache in sync.
 */
let cachedToken: string | null = null;
let tokenLoaded = false;

/**
 * Mobile token provider using Expo SecureStore with in-memory caching.
 */
const mobileTokenProvider: TokenProvider = {
  async getAccessToken() {
    if (!tokenLoaded) {
      cachedToken = await SecureStore.getItemAsync('accessToken');
      tokenLoaded = true;
    }
    return cachedToken;
  },
  async setAccessToken(token: string) {
    cachedToken = token;
    tokenLoaded = true;
    unauthorizedFired = false;
    await SecureStore.setItemAsync('accessToken', token);
  },
  async clearAccessToken() {
    cachedToken = null;
    tokenLoaded = true;
    unauthorizedFired = false;
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

// Store for callbacks
let onUnauthorizedCallback: (() => void) | null = null;
let onQuotaUpdateCallback: ((quota: QuotaHeaders) => void) | null = null;

// Prevents multiple 401 dispatches when several in-flight requests fail simultaneously.
// Reset in mobileTokenProvider.setAccessToken() on successful auth.
let unauthorizedFired = false;

export function setOnUnauthorized(callback: () => void) {
  onUnauthorizedCallback = callback;
}

export function setOnQuotaUpdate(callback: (quota: QuotaHeaders) => void) {
  onQuotaUpdateCallback = callback;
}

/**
 * Singleton API client instance for mobile.
 */
export const api = createApiClient({
  baseUrl: env.EXPO_PUBLIC_API_URL,
  httpAdapter: createRNHttpAdapter(),
  tokenProvider: mobileTokenProvider,
  appVersion: Constants.expoConfig?.version,
  platform: Platform.OS,
  onUnauthorized: () => {
    if (!unauthorizedFired) {
      unauthorizedFired = true;
      onUnauthorizedCallback?.();
    }
  },
  onQuotaUpdate: (quota) => {
    onQuotaUpdateCallback?.(quota);
  },
});

export { mobileTokenProvider };
