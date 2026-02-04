import { createApiClient, createFetchAdapter, type TokenProvider } from '@acme/api-client';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Web token provider using localStorage.
 */
const webTokenProvider: TokenProvider = {
  async getAccessToken() {
    return localStorage.getItem('accessToken');
  },
  async setAccessToken(token: string) {
    localStorage.setItem('accessToken', token);
  },
  async clearAccessToken() {
    localStorage.removeItem('accessToken');
  },
};

// Store for unauthorized callback
let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void) {
  onUnauthorizedCallback = callback;
}

/**
 * Singleton API client instance for web.
 */
export const api = createApiClient({
  baseUrl: API_URL,
  httpAdapter: createFetchAdapter(),
  tokenProvider: webTokenProvider,
  onUnauthorized: () => {
    onUnauthorizedCallback?.();
  },
});

export { webTokenProvider };
