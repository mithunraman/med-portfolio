import type { LoginResponse, AuthUser, OtpSendRequest, OtpSendResponse, OtpVerifyRequest, OtpClaimRequest, UpdateProfileRequest } from '@acme/shared';
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
    return this.client.post<LoginResponse>('/auth/guest', {}, {
      authenticated: false,
    });
  }

  async logout(): Promise<void> {
    return this.client.post<void>('/auth/logout', {}, { skipUnauthorizedCallback: true });
  }

  async me(): Promise<AuthUser> {
    return this.client.get<AuthUser>('/auth/me');
  }

  async updateProfile(data: UpdateProfileRequest): Promise<AuthUser> {
    return this.client.patch<AuthUser>('/auth/me', data);
  }
}
