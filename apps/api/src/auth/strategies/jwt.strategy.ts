import { AuthErrorCode } from '@acme/shared';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User, UserDocument } from '../schemas/user.schema';
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
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(SESSION_REPOSITORY) private sessionRepo: ISessionRepository
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('app.jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sid) {
      throw new UnauthorizedException({
        code: AuthErrorCode.TOKEN_INVALID,
        message: 'Token missing session id',
      });
    }

    const [user, sessionResult] = await Promise.all([
      this.userModel.findById(payload.sub).select('role anonymizedAt').lean(),
      this.sessionRepo.findById(payload.sid),
    ]);

    if (!user) {
      throw new UnauthorizedException({
        code: AuthErrorCode.USER_INACTIVE,
        message: 'User not found',
      });
    }
    if (user.anonymizedAt) {
      throw new UnauthorizedException({
        code: AuthErrorCode.USER_INACTIVE,
        message: 'Account is no longer active',
      });
    }

    if (!sessionResult.ok || !sessionResult.value) {
      throw new UnauthorizedException({
        code: AuthErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      });
    }

    const session = sessionResult.value;
    if (session.revokedAt) {
      throw new UnauthorizedException({
        code: AuthErrorCode.SESSION_REVOKED,
        message: 'Session has been revoked',
      });
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: AuthErrorCode.SESSION_EXPIRED,
        message: 'Session has expired',
      });
    }

    return {
      userId: payload.sub,
      role: user.role,
      sessionId: payload.sid,
    };
  }
}
