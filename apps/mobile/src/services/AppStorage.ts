import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const storageLogger = logger.createScope('Storage');

/**
 * Account hint for reinstall detection (non-sensitive).
 */
export interface AccountHint {
  email: string;
  userId: string;
  lastLoginAt: number;
}

/**
 * Onboarding state.
 * Note: We no longer track hasCompletedIntro - onboarding shows until user registers.
 */
export interface OnboardingState {
  lastVisitedScreen: string | null;
}

/**
 * Nudge rate limiting state.
 */
export interface NudgeState {
  lastNudgeTimestamp: number | null;
  nudgeCount: number;
  meaningfulActionsCount: number;
  dismissedBanners: string[];
}

/**
 * Type-safe mapping of storage keys to their value types.
 * Non-sensitive app state belongs here.
 */
export interface StorageSchema {
  accountHint: AccountHint;
  onboarding: OnboardingState;
  nudge: NudgeState;
}

export type StorageKey = keyof StorageSchema;

/**
 * Type-safe storage service for non-sensitive app data.
 * Uses AsyncStorage.
 */
class AppStorageService {
  private prefix = '@app:';

  private getKey(key: StorageKey): string {
    return `${this.prefix}${key}`;
  }

  async get<K extends StorageKey>(key: K): Promise<StorageSchema[K] | null> {
    try {
      const value = await AsyncStorage.getItem(this.getKey(key));
      if (value === null) {
        return null;
      }
      return JSON.parse(value) as StorageSchema[K];
    } catch (error) {
      storageLogger.error('Failed to get item', { key, error: String(error) });
      return null;
    }
  }

  async set<K extends StorageKey>(key: K, value: StorageSchema[K]): Promise<boolean> {
    try {
      await AsyncStorage.setItem(this.getKey(key), JSON.stringify(value));
      storageLogger.debug('Item stored', { key });
      return true;
    } catch (error) {
      storageLogger.error('Failed to set item', { key, error: String(error) });
      return false;
    }
  }

  async remove<K extends StorageKey>(key: K): Promise<boolean> {
    try {
      await AsyncStorage.removeItem(this.getKey(key));
      storageLogger.debug('Item removed', { key });
      return true;
    } catch (error) {
      storageLogger.error('Failed to remove item', { key, error: String(error) });
      return false;
    }
  }

  async has<K extends StorageKey>(key: K): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Clear all non-sensitive app data.
   */
  async clearAll(): Promise<void> {
    const keys: StorageKey[] = ['accountHint', 'onboarding', 'nudge'];
    await Promise.all(keys.map((key) => this.remove(key)));
    storageLogger.info('All storage cleared');
  }
}

export const AppStorage = new AppStorageService();
export default AppStorage;
