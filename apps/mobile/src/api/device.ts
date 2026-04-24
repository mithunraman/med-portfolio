import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'auth.deviceId';

let cachedDeviceId: string | null = null;

/**
 * Stable per-install device id. Generated once on first launch, stored in
 * SecureStore (survives app restarts, resets on uninstall).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }

  const newId = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
  cachedDeviceId = newId;
  return newId;
}

export function getDeviceName(): string {
  const model = Constants.deviceName ?? 'Unknown';
  return `${Platform.OS} ${model}`.trim();
}

export function getOsLabel(): string {
  return `${Platform.OS} ${Platform.Version}`;
}
