import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { UserDocument } from './schemas/user.schema';

export interface AccessTokenPayload {
  sub: string;
  role: number;
  sid: string;
}

export interface GeneratedRefreshToken {
  raw: string;
  hash: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(user: UserDocument, sessionId: string): string {
    const payload: AccessTokenPayload = {
      sub: user._id.toString(),
      role: user.role,
      sid: sessionId,
    };
    return this.jwtService.sign(payload);
  }

  generateRefreshToken(): GeneratedRefreshToken {
    const raw = crypto.randomBytes(32).toString('base64url');
    return { raw, hash: this.hashRefreshToken(raw) };
  }

  hashRefreshToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  generateFamily(): string {
    return crypto.randomUUID();
  }
}
