import { z } from 'zod';
import { Specialty } from '../enums/specialty.enum';
import { UserRole } from '../enums/user-role.enum';

export const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.nativeEnum(UserRole),
  specialty: z
    .object({
      code: z.nativeEnum(Specialty),
      name: z.string(),
      trainingStage: z.object({
        code: z.string(),
        label: z.string(),
      }),
    })
    .nullable(),
  deletionRequestedAt: z.string().nullable(),
  deletionScheduledFor: z.string().nullable(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const UpdateProfileRequestSchema = z.object({
  specialty: z.nativeEnum(Specialty),
  trainingStage: z.string(),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
});

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: AuthUserSchema,
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const RefreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;

export const SessionViewSchema = z.object({
  id: z.string(),
  deviceName: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  isCurrent: z.boolean(),
});

export type SessionView = z.infer<typeof SessionViewSchema>;

export enum AuthErrorCode {
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  SESSION_REVOKED = 'SESSION_REVOKED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  REFRESH_INVALID = 'REFRESH_INVALID',
  REFRESH_REPLAY = 'REFRESH_REPLAY',
  USER_INACTIVE = 'USER_INACTIVE',
}

// ── OTP ──

export const OtpSendRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export type OtpSendRequest = z.infer<typeof OtpSendRequestSchema>;

export const OtpSendResponseSchema = z.object({
  message: z.string(),
  isNewUser: z.boolean(),
  devOtp: z.string().optional(),
});

export type OtpSendResponse = z.infer<typeof OtpSendResponseSchema>;

export const OtpVerifyRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'OTP must be exactly 6 digits'),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
});

export type OtpVerifyRequest = z.infer<typeof OtpVerifyRequestSchema>;

export const OtpClaimRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'OTP must be exactly 6 digits'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

export type OtpClaimRequest = z.infer<typeof OtpClaimRequestSchema>;
