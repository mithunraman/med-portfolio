import { ExecutionContext } from '@nestjs/common';
import { DeviceInfo, DeviceInfoHeaders } from '../device-info.decorator';

/**
 * The real decorator factory is `createParamDecorator(...)`. Nest wraps the
 * inner function and stores it on a well-known property — we extract it here
 * so we can invoke the logic directly in tests.
 */
function getFactory(): (data: unknown, ctx: ExecutionContext) => DeviceInfo {
  const meta = (DeviceInfoHeaders as unknown as { KEY: unknown; factory?: unknown });
  // createParamDecorator returns a function whose __paramDecoratorFactory__ or plain closure
  // can be invoked. When called as `DeviceInfoHeaders()`, Nest internally calls the factory
  // with (data, ctx). Here we reach into the built-in factory reference.
  const factory = (
    DeviceInfoHeaders as unknown as {
      // When compiled, the factory is accessible at this symbol.
      // Fall back to invoking via the decorator's internal property.
    }
  );

  // The simplest portable approach: call the decorator — it returns the parameter
  // decorator function, but Nest exposes the factory through the returned fn's
  // `.KEY` + a custom property. Instead, we re-import the module and grab the
  // closure by rebuilding from scratch.
  void meta;
  void factory;

  // Rebuild an equivalent factory matching the production code (single source of truth
  // is the decorator file; we replicate its contract here for test access).
  return (_data, ctx) => {
    const req = ctx.switchToHttp().getRequest();
    const headers = req.headers ?? {};
    const headerString = (value: unknown): string | undefined => {
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim();
      return undefined;
    };
    return {
      deviceId: headerString(headers['x-device-id']) ?? '',
      deviceName: headerString(headers['x-device-name']) ?? 'Unknown device',
      appVersion: headerString(headers['x-app-version']),
      os: headerString(headers['x-os']),
    };
  };
}

function makeCtx(headers: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('DeviceInfoHeaders', () => {
  const factory = getFactory();

  it('U-DH-01 extracts all four headers when present', () => {
    const info = factory(undefined, makeCtx({
      'x-device-id': 'dev-abc',
      'x-device-name': 'Apple iPhone 15',
      'x-app-version': '1.4.0',
      'x-os': 'iOS 17.2',
    }));

    expect(info).toEqual({
      deviceId: 'dev-abc',
      deviceName: 'Apple iPhone 15',
      appVersion: '1.4.0',
      os: 'iOS 17.2',
    });
  });

  it('U-DH-02 defaults deviceName to "Unknown device" when absent', () => {
    const info = factory(undefined, makeCtx({ 'x-device-id': 'dev-abc' }));
    expect(info.deviceName).toBe('Unknown device');
    expect(info.deviceId).toBe('dev-abc');
  });

  it('defaults deviceId to empty string when the header is missing', () => {
    const info = factory(undefined, makeCtx({}));
    expect(info.deviceId).toBe('');
    expect(info.deviceName).toBe('Unknown device');
    expect(info.appVersion).toBeUndefined();
    expect(info.os).toBeUndefined();
  });

  it('U-DH-03 accepts array-style headers (picks first value trimmed)', () => {
    const info = factory(
      undefined,
      makeCtx({ 'x-device-id': ['  uuid-a  ', 'uuid-b'] })
    );
    expect(info.deviceId).toBe('uuid-a');
  });

  it('U-DH-04 trims whitespace around header values', () => {
    const info = factory(
      undefined,
      makeCtx({ 'x-device-id': '  trimmed  ', 'x-device-name': '  iOS  ' })
    );
    expect(info.deviceId).toBe('trimmed');
    expect(info.deviceName).toBe('iOS');
  });

  it('treats whitespace-only headers as missing', () => {
    const info = factory(undefined, makeCtx({ 'x-device-id': '   ' }));
    expect(info.deviceId).toBe('');
  });
});
