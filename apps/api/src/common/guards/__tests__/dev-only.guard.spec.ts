import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IS_DEV_ONLY_KEY } from '../../decorators/dev-only.decorator';
import { DevOnlyGuard } from '../dev-only.guard';

function createMockReflector(isDevOnly: boolean | undefined) {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(isDevOnly),
  } as unknown as Reflector;
}

function createMockConfigService(isDevelopment: boolean | undefined) {
  return {
    get: jest.fn().mockReturnValue(isDevelopment),
  } as unknown as ConfigService;
}

function createMockContext() {
  const handler = () => undefined;
  class TestClass {}
  return {
    getHandler: () => handler,
    getClass: () => TestClass,
  } as unknown as ExecutionContext;
}

describe('DevOnlyGuard', () => {
  it('U-G-01: allows routes that are not marked @DevOnly (reflector returns undefined)', () => {
    const guard = new DevOnlyGuard(
      createMockReflector(undefined),
      createMockConfigService(false),
    );

    expect(guard.canActivate(createMockContext())).toBe(true);
  });

  it('U-G-02: allows @DevOnly routes in a development environment', () => {
    const guard = new DevOnlyGuard(
      createMockReflector(true),
      createMockConfigService(true),
    );

    expect(guard.canActivate(createMockContext())).toBe(true);
  });

  it('U-G-03: throws NotFoundException for @DevOnly routes in a non-dev environment', () => {
    const guard = new DevOnlyGuard(
      createMockReflector(true),
      createMockConfigService(false),
    );

    expect(() => guard.canActivate(createMockContext())).toThrow(NotFoundException);
  });

  it('U-G-04: treats a missing app.isDevelopment config as non-dev (defaults to false)', () => {
    const guard = new DevOnlyGuard(
      createMockReflector(true),
      createMockConfigService(undefined),
    );

    expect(() => guard.canActivate(createMockContext())).toThrow(NotFoundException);
  });

  it('U-G-05: reads dev-only metadata from both handler and class', () => {
    const reflector = createMockReflector(true);
    const guard = new DevOnlyGuard(reflector, createMockConfigService(true));
    const context = createMockContext();

    guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_DEV_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
