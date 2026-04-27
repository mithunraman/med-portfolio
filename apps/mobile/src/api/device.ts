import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { AppSecureStorage, SECURE_STORAGE_KEYS } from '../services';

let cachedDeviceId: string | null = null;
let cachedDeviceName: string | null = null;
let cachedOsLabel: string | null = null;

/**
 * Stable per-install device id. Generated once on first launch, stored in
 * SecureStore (survives app restarts, resets on uninstall).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const existing = await AppSecureStorage.get(SECURE_STORAGE_KEYS.DEVICE_ID);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }

  const newId = Crypto.randomUUID();
  await AppSecureStorage.set(SECURE_STORAGE_KEYS.DEVICE_ID, newId);
  cachedDeviceId = newId;
  return newId;
}

export function getDeviceName(): string {
  if (cachedDeviceName) return cachedDeviceName;
  const model = Constants.deviceName ?? 'Unknown';
  cachedDeviceName = `${Platform.OS} ${model}`.trim();
  return cachedDeviceName;
}

export function getOsLabel(): string {
  if (cachedOsLabel) return cachedOsLabel;
  cachedOsLabel = `${Platform.OS} ${Platform.Version}`;
  return cachedOsLabel;
}
