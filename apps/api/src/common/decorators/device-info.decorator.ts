import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  appVersion?: string;
  os?: string;
}

function headerString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
  return undefined;
}

export const DeviceInfoHeaders = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): DeviceInfo => {
    const req = ctx.switchToHttp().getRequest();
    const headers = req.headers ?? {};
    return {
      deviceId: headerString(headers['x-device-id']) ?? '',
      deviceName: headerString(headers['x-device-name']) ?? 'Unknown device',
      appVersion: headerString(headers['x-app-version']),
      os: headerString(headers['x-os']),
    };
  }
);
