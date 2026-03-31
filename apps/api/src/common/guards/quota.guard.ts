import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { QUOTA_TYPE_KEY } from '../decorators/use-quota.decorator';
import { QuotaService } from '../../quota/quota.service';

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quotaService: QuotaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const quotaType = this.reflector.getAllAndOverride<string | undefined>(QUOTA_TYPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @UseQuota() decorator — skip
    if (!quotaType) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // No authenticated user (shouldn't happen — JwtAuthGuard runs first)
    if (!user?.userId) return true;

    try {
      // checkQuota throws if exceeded
      const status = await this.quotaService.checkQuota(user.userId, user.role);
      // Attach quota status to request for the interceptor
      request.quotaStatus = status;
      return true;
    } catch (error: any) {
      if (error.status === 429 && error.response) {
        throw new HttpException(error.response, 429);
      }
      throw error;
    }
  }
}
