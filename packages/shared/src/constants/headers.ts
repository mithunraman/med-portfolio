/**
 * HTTP header names shared by the API, mobile client, and web client.
 *
 * Using constants instead of string literals on both sides of the wire
 * prevents silent auth breakage when a typo slips in.
 */
export const HEADERS = {
  REQUEST_ID: 'x-request-id',
  APP_VERSION: 'x-app-version',
  PLATFORM: 'x-platform',
  AUTHORIZATION: 'Authorization',
  DEVICE_ID: 'x-device-id',
  DEVICE_NAME: 'x-device-name',
  OS: 'x-os',
} as const;

export type HeaderName = (typeof HEADERS)[keyof typeof HEADERS];
