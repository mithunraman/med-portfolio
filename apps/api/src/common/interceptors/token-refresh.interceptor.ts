import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as Sentry from '@sentry/nestjs';
import { Model } from 'mongoose';
import { Observable, tap } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { User, UserDocument } from '../../auth/schemas/user.schema';

@Injectable()
export class TokenRefreshInterceptor implements NestInterceptor {
  constructor(
    private readonly authService: AuthService,
    @InjectModel(User.name) private userModel: Model<UserDocument>
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const user = request.user;

    // Only refresh for authenticated requests (user is set by JwtStrategy)
    if (!user?.userId) {
      return next.handle();
    }

    // Set Sentry user context so all errors in this request are attributed
    Sentry.setUser({ id: user.userId });

    return next.handle().pipe(
      tap(async () => {
        try {
          const userDoc = (await this.userModel
            .findById(user.userId)
            .lean()) as UserDocument | null;

          if (userDoc) {
            const newToken = this.authService.generateToken(userDoc);
            response.setHeader('X-Refreshed-Token', newToken);
          }
        } catch {
          // Silently fail — token refresh is best-effort
        }
      })
    );
  }
}
