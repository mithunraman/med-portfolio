import type {
  AuthUser,
  LoginResponse,
  OtpClaimRequest,
  OtpSendRequest,
  OtpSendResponse,
  OtpVerifyRequest,
  RefreshTokenResponse,
  SessionView,
  UpdateProfileRequest,
} from '@acme/shared';
import { BaseApiClient } from '../core/api-client';

export class AuthClient {
  constructor(private readonly client: BaseApiClient) {}

  async otpSend(data: OtpSendRequest): Promise<OtpSendResponse> {
    return this.client.post<OtpSendResponse>('/auth/otp/send', data, {
      authenticated: false,
    });
  }

  async otpVerify(data: OtpVerifyRequest): Promise<LoginResponse> {
    return this.client.post<LoginResponse>('/auth/otp/verify', data, {
      authenticated: false,
    });
  }

  async claimGuest(data: OtpClaimRequest): Promise<LoginResponse> {
    return this.client.post<LoginResponse>('/auth/claim', data);
  }

  async registerGuest(): Promise<LoginResponse> {
    return this.client.post<LoginResponse>(
      '/auth/guest',
      {},
      { authenticated: false }
    );
  }

  async refresh(refreshToken: string): Promise<RefreshTokenResponse> {
    return this.client.post<RefreshTokenResponse>(
      '/auth/refresh',
      { refreshToken },
      { authenticated: false, skipRefresh: true }
    );
  }

  async logout(): Promise<void> {
    return this.client.post<void>('/auth/logout', {}, { skipUnauthorizedCallback: true });
  }

  async logoutAll(): Promise<void> {
    return this.client.post<void>('/auth/logout-all', {});
  }

  async listSessions(): Promise<SessionView[]> {
    return this.client.get<SessionView[]>('/auth/sessions');
  }

  async revokeSession(id: string): Promise<void> {
    return this.client.delete<void>(`/auth/sessions/${id}`);
  }

  async requestDeletion(): Promise<AuthUser> {
    return this.client.post<AuthUser>('/auth/me/request-deletion', {});
  }

  async cancelDeletion(): Promise<AuthUser> {
    return this.client.post<AuthUser>('/auth/me/cancel-deletion', {});
  }

  async me(): Promise<AuthUser> {
    return this.client.get<AuthUser>('/auth/me');
  }

  async updateProfile(data: UpdateProfileRequest): Promise<AuthUser> {
    return this.client.patch<AuthUser>('/auth/me', data);
  }
}
