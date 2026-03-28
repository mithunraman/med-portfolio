import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_DEV_ONLY_KEY } from '../decorators/dev-only.decorator';

@Injectable()
export class DevOnlyGuard implements CanActivate {
  private readonly isDev: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.isDev = this.configService.get<string>('app.nodeEnv') === 'development';
  }

  canActivate(context: ExecutionContext): boolean {
    const isDevOnly = this.reflector.getAllAndOverride<boolean>(IS_DEV_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isDevOnly) return true;

    // Return 404 in non-dev environments so the route doesn't leak its existence
    if (!this.isDev) throw new NotFoundException();

    return true;
  }
}
