import { AuthErrorCode } from '@acme/shared';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../sessions.repository.interface';

export interface JwtPayload {
  sub: string;
  role: number;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject(SESSION_REPOSITORY) private sessionRepo: ISessionRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('app.jwt.accessSecret'),
    });
  }

  /**
   * The session is the authoritative per-request state: revocation, expiry,
   * and anonymization (which revokes all sessions in AccountCleanupService)
   * are all caught by this single lookup. `role` comes from the JWT payload —
   * it's safe because a role change requires re-auth, which produces a new
   * session + new token.
   */
  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    if (!payload.sid) {
      throw new UnauthorizedException({
        code: AuthErrorCode.TOKEN_INVALID,
        message: 'Token missing session id',
      });
    }

    const result = await this.sessionRepo.findRevocationStatus(payload.sid);
    if (!result.ok || !result.value) {
      throw new UnauthorizedException({
        code: AuthErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      });
    }

    const { revokedAt, expiresAt } = result.value;
    if (revokedAt) {
      throw new UnauthorizedException({
        code: AuthErrorCode.SESSION_REVOKED,
        message: 'Session has been revoked',
      });
    }
    if (expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: AuthErrorCode.SESSION_EXPIRED,
        message: 'Session has expired',
      });
    }

    return {
      userId: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
    };
  }
}
