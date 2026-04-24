import {
  createApiClient,
  type DeviceInfoProvider,
  type HttpAdapter,
  type QuotaHeaders,
  type TokenProvider,
} from '@acme/api-client';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getDeviceName, getOrCreateDeviceId, getOsLabel } from './device';

const apiLogger = logger.createScope('API');

/**
 * In-memory cache for both tokens to avoid a native bridge call per request.
 * SecureStore is read once on cold start; mutations keep the cache in sync.
 */
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let tokensLoaded = false;

async function loadTokensOnce() {
  if (tokensLoaded) return;
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync('accessToken'),
    SecureStore.getItemAsync('refreshToken'),
  ]);
  cachedAccessToken = access;
  cachedRefreshToken = refresh;
  tokensLoaded = true;
}

const mobileTokenProvider: TokenProvider = {
  async getAccessToken() {
    await loadTokensOnce();
    return cachedAccessToken;
  },
  async getRefreshToken() {
    await loadTokensOnce();
    return cachedRefreshToken;
  },
  async setTokens({ accessToken, refreshToken }) {
    cachedAccessToken = accessToken;
    cachedRefreshToken = refreshToken;
    tokensLoaded = true;
    unauthorizedFired = false;
    await Promise.all([
      SecureStore.setItemAsync('accessToken', accessToken),
      SecureStore.setItemAsync('refreshToken', refreshToken),
    ]);
  },
  async clearTokens() {
    cachedAccessToken = null;
    cachedRefreshToken = null;
    tokensLoaded = true;
    await Promise.all([
      SecureStore.deleteItemAsync('accessToken'),
      SecureStore.deleteItemAsync('refreshToken'),
    ]);
  },
};

const mobileDeviceInfoProvider: DeviceInfoProvider = {
  getDeviceId: () => getOrCreateDeviceId(),
  getDeviceName: () => getDeviceName(),
  getOs: () => getOsLabel(),
};

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

let onUnauthorizedCallback: (() => void) | null = null;
let onQuotaUpdateCallback: ((quota: QuotaHeaders) => void) | null = null;
let unauthorizedFired = false;

export function setOnUnauthorized(callback: () => void) {
  onUnauthorizedCallback = callback;
}

export function setOnQuotaUpdate(callback: (quota: QuotaHeaders) => void) {
  onQuotaUpdateCallback = callback;
}

export const api = createApiClient({
  baseUrl: env.EXPO_PUBLIC_API_URL,
  httpAdapter: createRNHttpAdapter(),
  tokenProvider: mobileTokenProvider,
  deviceInfoProvider: mobileDeviceInfoProvider,
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
