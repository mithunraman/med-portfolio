import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';
import type { AuthUser } from '@acme/shared';

const storageLogger = logger.createScope('SecureStorage');

/**
 * Stored user session with credentials for seamless re-auth.
 */
export interface StoredUserSession {
  user: AuthUser;
  email: string;
  password: string;
  isGuest: boolean;
  lastLoginAt: number;
}

/**
 * Type-safe mapping of secure storage keys to their value types.
 * Only sensitive data belongs here.
 */
export interface SecureStorageSchema {
  accessToken: string;
  user: StoredUserSession;
}

export type SecureStorageKey = keyof SecureStorageSchema;

/**
 * Type-safe secure storage service for sensitive data.
 * Uses Expo SecureStore (encrypted).
 */
class AppSecureStorageService {
  async get<K extends SecureStorageKey>(key: K): Promise<SecureStorageSchema[K] | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value === null) {
        return null;
      }

      if (key === 'accessToken') {
        return value as SecureStorageSchema[K];
      }

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
   * Clear all session data (logout).
   */
  async clearSession(): Promise<void> {
    await Promise.all([this.remove('accessToken'), this.remove('user')]);
    storageLogger.info('Session cleared');
  }
}

export const AppSecureStorage = new AppSecureStorageService();
export default AppSecureStorage;
