import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createApiClient, type TokenProvider, type HttpAdapter } from '@acme/api-client';
import { env } from '../config/env';

/**
 * Mobile token provider using Expo SecureStore.
 * Falls back to a simple in-memory store for web.
 */
let inMemoryToken: string | null = null;

const mobileTokenProvider: TokenProvider = {
  async getAccessToken() {
    if (Platform.OS === 'web') {
      return inMemoryToken;
    }
    return SecureStore.getItemAsync('accessToken');
  },
  async setAccessToken(token: string) {
    if (Platform.OS === 'web') {
      inMemoryToken = token;
      return;
    }
    await SecureStore.setItemAsync('accessToken', token);
  },
  async clearAccessToken() {
    if (Platform.OS === 'web') {
      inMemoryToken = null;
      return;
    }
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

        return { data, status: response.status, headers: responseHeaders };
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
