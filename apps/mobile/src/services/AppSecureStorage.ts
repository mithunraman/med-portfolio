import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';
import type { AuthUser } from '@acme/shared';

const storageLogger = logger.createScope('SecureStorage');

/**
 * Centralised SecureStore key names. Import from here — do not hard-code
 * string literals at call sites.
 */
export const SECURE_STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  DEVICE_ID: 'deviceId',
  USER: 'user',
} as const;

/**
 * Stored user session metadata. `isGuest` is NOT stored — derive it from
 * `user.role === UserRole.USER_GUEST` when needed.
 */
export interface StoredUserSession {
  user: AuthUser;
  lastLoginAt: number;
}

/**
 * Type-safe mapping of secure storage keys to their value types.
 */
export interface SecureStorageSchema {
  [SECURE_STORAGE_KEYS.ACCESS_TOKEN]: string;
  [SECURE_STORAGE_KEYS.REFRESH_TOKEN]: string;
  [SECURE_STORAGE_KEYS.DEVICE_ID]: string;
  [SECURE_STORAGE_KEYS.USER]: StoredUserSession;
}

export type SecureStorageKey = keyof SecureStorageSchema;

const STRING_KEYS: ReadonlySet<SecureStorageKey> = new Set([
  SECURE_STORAGE_KEYS.ACCESS_TOKEN,
  SECURE_STORAGE_KEYS.REFRESH_TOKEN,
  SECURE_STORAGE_KEYS.DEVICE_ID,
]);

/**
 * Type-safe secure storage service for sensitive data.
 * Uses Expo SecureStore (encrypted).
 */
class AppSecureStorageService {
  async get<K extends SecureStorageKey>(key: K): Promise<SecureStorageSchema[K] | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value === null) return null;
      if (STRING_KEYS.has(key)) return value as SecureStorageSchema[K];
      return JSON.parse(value) as SecureStorageSchema[K];
    } catch (error) {
      storageLogger.error('Failed to get item', { key, error: String(error) });
      return null;
    }
  }

  async set<K extends SecureStorageKey>(key: K, value: SecureStorageSchema[K]): Promise<boolean> {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await SecureStore.setItemAsync(key, serialized);
      storageLogger.debug('Item stored', { key });
      return true;
    } catch (error) {
      storageLogger.error('Failed to set item', { key, error: String(error) });
      return false;
    }
  }

  async remove<K extends SecureStorageKey>(key: K): Promise<boolean> {
    try {
      await SecureStore.deleteItemAsync(key);
      storageLogger.debug('Item removed', { key });
      return true;
    } catch (error) {
      storageLogger.error('Failed to remove item', { key, error: String(error) });
      return false;
    }
  }

  async has<K extends SecureStorageKey>(key: K): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Clear session-scoped data on logout.
   * Intentionally does NOT touch DEVICE_ID — that's a per-install identifier
   * that survives logout and only resets on uninstall.
   */
  async clearSession(): Promise<void> {
    await Promise.all([
      this.remove(SECURE_STORAGE_KEYS.ACCESS_TOKEN),
      this.remove(SECURE_STORAGE_KEYS.REFRESH_TOKEN),
      this.remove(SECURE_STORAGE_KEYS.USER),
    ]);
    storageLogger.info('Session cleared');
  }
}

export const AppSecureStorage = new AppSecureStorageService();
export default AppSecureStorage;
