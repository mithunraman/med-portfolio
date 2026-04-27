import { HEADERS } from '@acme/shared';
import {
  createApiClient,
  createFetchAdapter,
  type DeviceInfoProvider,
  type QuotaHeaders,
  type TokenProvider,
} from '@acme/api-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { env } from '../config/env';
import { AppSecureStorage, SECURE_STORAGE_KEYS } from '../services';
import { logger } from '../utils/logger';
import { getDeviceName, getOrCreateDeviceId, getOsLabel } from './device';

const apiLogger = logger.createScope('API');

/**
 * In-memory token cache: avoid a native-bridge SecureStore roundtrip on every
 * request. Seeded on cold boot via `loadTokensOnce()`; mutations keep the
 * cache in sync with SecureStore.
 */
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let loadTokensPromise: Promise<void> | null = null;

function loadTokensOnce(): Promise<void> {
  if (!loadTokensPromise) {
    loadTokensPromise = (async () => {
      const [access, refresh] = await Promise.all([
        AppSecureStorage.get(SECURE_STORAGE_KEYS.ACCESS_TOKEN),
        AppSecureStorage.get(SECURE_STORAGE_KEYS.REFRESH_TOKEN),
      ]);
      cachedAccessToken = access;
      cachedRefreshToken = refresh;
    })();
  }
  return loadTokensPromise;
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
    await loadTokensOnce(); // ensure the load flag is set
    await Promise.all([
      AppSecureStorage.set(SECURE_STORAGE_KEYS.ACCESS_TOKEN, accessToken),
      AppSecureStorage.set(SECURE_STORAGE_KEYS.REFRESH_TOKEN, refreshToken),
    ]);
  },
  async clearTokens() {
    cachedAccessToken = null;
    cachedRefreshToken = null;
    await loadTokensOnce();
    await Promise.all([
      AppSecureStorage.remove(SECURE_STORAGE_KEYS.ACCESS_TOKEN),
      AppSecureStorage.remove(SECURE_STORAGE_KEYS.REFRESH_TOKEN),
    ]);
  },
};

let cachedDeviceHeaders: Record<string, string> | null = null;

const mobileDeviceInfoProvider: DeviceInfoProvider = {
  async getDeviceHeaders() {
    if (cachedDeviceHeaders) return cachedDeviceHeaders;
    cachedDeviceHeaders = {
      [HEADERS.DEVICE_ID]: await getOrCreateDeviceId(),
      [HEADERS.DEVICE_NAME]: getDeviceName(),
      [HEADERS.OS]: getOsLabel(),
    };
    return cachedDeviceHeaders;
  },
};

let onUnauthorizedCallback: (() => void) | null = null;
let onQuotaUpdateCallback: ((quota: QuotaHeaders) => void) | null = null;

export function setOnUnauthorized(callback: (() => void) | null): void {
  onUnauthorizedCallback = callback;
}

export function setOnQuotaUpdate(callback: ((quota: QuotaHeaders) => void) | null): void {
  onQuotaUpdateCallback = callback;
}

export const api = createApiClient({
  baseUrl: env.EXPO_PUBLIC_API_URL,
  httpAdapter: createFetchAdapter({ logger: apiLogger }),
  tokenProvider: mobileTokenProvider,
  deviceInfoProvider: mobileDeviceInfoProvider,
  appVersion: Constants.expoConfig?.version,
  platform: Platform.OS,
  onUnauthorized: () => onUnauthorizedCallback?.(),
  onQuotaUpdate: (quota) => onQuotaUpdateCallback?.(quota),
});

export { mobileTokenProvider };
