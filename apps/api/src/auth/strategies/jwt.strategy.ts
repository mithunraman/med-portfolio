import { AuthErrorCode, SessionRevokedReason } from '@acme/shared';
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { ISessionRepository, SESSION_REPOSITORY } from '../sessions.repository.interface';

export interface JwtPayload {
  sub: string;
  role: number;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

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
   *
   * The session.userId vs payload.sub equality check below is defence-in-depth
   * against a JWT-secret compromise: even a validly-signed token cannot be used
   * to impersonate a different user against an existing live session.
   * A mismatch is treated as a forgery signal — the session is revoked.
   */
  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    if (!payload.sid || !payload.sub) {
      throw new UnauthorizedException({
        code: AuthErrorCode.TOKEN_INVALID,
        message: 'Token missing required claims',
      });
    }

    const result = await this.sessionRepo.findRevocationStatus(payload.sid);
    if (!result.ok || !result.value) {
      throw new UnauthorizedException({
        code: AuthErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      });
    }

    const { userId: sessionUserId, revokedAt, expiresAt } = result.value;
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

    if (sessionUserId !== payload.sub) {
      this.logger.warn(
        `auth.token.mismatch sessionId=${payload.sid} sessionUserId=${sessionUserId} tokenSub=${payload.sub}`
      );
      // Best-effort revoke — do not let a DB failure mask the rejection. The
      // outcome is the same: this token is refused. The session, if it survives
      // a transient repo error, will still be caught by the next mismatch check.
      await this.sessionRepo.revoke(payload.sid, SessionRevokedReason.SUSPICIOUS);
      throw new UnauthorizedException({
        code: AuthErrorCode.TOKEN_INVALID,
        message: 'Token does not match session',
      });
    }

    return {
      userId: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
    };
  }
}
