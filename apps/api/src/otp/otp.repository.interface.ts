import type { Result } from '../common/utils/result.util';
import type { Otp } from './schemas/otp.schema';

export const OTP_REPOSITORY = Symbol('OTP_REPOSITORY');

export interface DBError {
  code: string;
  message: string;
}

export interface CreateOtpData {
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts?: number;
}

export interface IOtpRepository {
  create(data: CreateOtpData): Promise<Result<Otp, DBError>>;

  findLatestByEmail(email: string): Promise<Result<Otp | null, DBError>>;

  incrementAttempts(id: string): Promise<Result<Otp | null, DBError>>;

  deleteByEmail(email: string): Promise<Result<number, DBError>>;

  countRecentByEmail(email: string, since: Date): Promise<Result<number, DBError>>;
}
