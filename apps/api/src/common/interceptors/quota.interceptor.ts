import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { QuotaService } from '../../quota/quota.service';
import { QUOTA_TYPE_KEY } from '../decorators/use-quota.decorator';

@Injectable()
export class QuotaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly quotaService: QuotaService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const quotaType = this.reflector.getAllAndOverride<string | undefined>(QUOTA_TYPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!quotaType) return next.handle();

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const user = request.user;

    if (!user?.userId) return next.handle();

    return next.handle().pipe(
      tap({
        next: async () => {
          try {
            // Record the usage event
            await this.quotaService.recordEvent(user.userId, quotaType);

            // Fetch fresh status for response headers
            const status = await this.quotaService.getQuotaStatus(user.userId, user.role);

            response.setHeader('X-Quota-Short-Used', status.shortWindow.used);
            response.setHeader('X-Quota-Short-Limit', status.shortWindow.limit);
            if (status.shortWindow.resetsAt) {
              response.setHeader('X-Quota-Short-Reset', status.shortWindow.resetsAt);
            }
            response.setHeader('X-Quota-Weekly-Used', status.weeklyWindow.used);
            response.setHeader('X-Quota-Weekly-Limit', status.weeklyWindow.limit);
            response.setHeader('X-Quota-Weekly-Reset', status.weeklyWindow.resetsAt ?? '');
          } catch {
            // Quota recording/headers are best-effort — don't fail the request
          }
        },
      })
    );
  }
}
