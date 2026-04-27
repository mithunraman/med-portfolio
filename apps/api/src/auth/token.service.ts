import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

export interface AccessTokenPayload {
  sub: string;
  role: number;
  sid: string;
}

export interface GeneratedRefreshToken {
  raw: string;
  hash: string;
}

export interface AccessTokenSubject {
  id: string;
  role: number;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(subject: AccessTokenSubject, sessionId: string): string {
    const payload: AccessTokenPayload = {
      sub: subject.id,
      role: subject.role,
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
