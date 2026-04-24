import { createApiClient, createFetchAdapter, type TokenProvider } from '@acme/api-client';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

const webTokenProvider: TokenProvider = {
  async getAccessToken() {
    return localStorage.getItem(ACCESS_KEY);
  },
  async getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY);
  },
  async setTokens({ accessToken, refreshToken }) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  async clearTokens() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

let onUnauthorizedCallback: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void) {
  onUnauthorizedCallback = callback;
}

export const api = createApiClient({
  baseUrl: API_URL,
  httpAdapter: createFetchAdapter(),
  tokenProvider: webTokenProvider,
  onUnauthorized: () => {
    onUnauthorizedCallback?.();
  },
});

export { webTokenProvider };
