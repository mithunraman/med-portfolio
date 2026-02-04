import type { LoginRequest, LoginResponse, AuthUser, RegisterRequest } from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class AuthClient {
  constructor(private readonly client: BaseApiClient) {}

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    return this.client.post<LoginResponse>('/auth/login', credentials, {
      authenticated: false,
    });
  }

  async register(data: RegisterRequest): Promise<LoginResponse> {
    return this.client.post<LoginResponse>('/auth/register', data, {
      authenticated: false,
    });
  }

  async logout(): Promise<void> {
    return this.client.post<void>('/auth/logout', {});
  }

  async refreshToken(): Promise<{ accessToken: string }> {
    return this.client.post<{ accessToken: string }>('/auth/refresh', {});
  }

  async me(): Promise<AuthUser> {
    return this.client.get<AuthUser>('/auth/me');
  }
}
