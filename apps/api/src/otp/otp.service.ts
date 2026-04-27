import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { isErr } from '../common/utils/result.util';
import { EmailService } from '../email';
import { EmailLockoutService } from './email-lockout.service';
import { IOtpRepository, OTP_REPOSITORY } from './otp.repository.interface';

const TEST_OTP_DOMAIN = '@logdit.app';
const TEST_OTP_CODE = '112233';

export interface SendOtpResult {
  message: string;
}

export interface VerifyOtpResult {
  email: string;
  valid: true;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly expiryMinutes: number;
  private readonly maxAttempts: number;
  private readonly rateLimitMax: number;
  private readonly rateLimitWindowMinutes: number;
  private readonly isDevelopment: boolean;

  constructor(
    @Inject(OTP_REPOSITORY) private readonly otpRepo: IOtpRepository,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly emailLockout: EmailLockoutService
  ) {
    this.expiryMinutes = this.configService.get<number>('app.otp.expiryMinutes', 5);
    this.maxAttempts = this.configService.get<number>('app.otp.maxAttempts', 3);
    this.rateLimitMax = this.configService.get<number>('app.otp.rateLimitMax', 3);
    this.rateLimitWindowMinutes = this.configService.get<number>(
      'app.otp.rateLimitWindowMinutes',
      10
    );
    this.isDevelopment = this.configService.get<boolean>('app.isDevelopment') ?? false;
  }

  private isTestEmail(email: string): boolean {
    return this.isDevelopment && email.endsWith(TEST_OTP_DOMAIN);
  }

  async sendOtp(email: string): Promise<SendOtpResult> {
    const normalizedEmail = email.toLowerCase();

    await this.checkRateLimit(normalizedEmail);

    // Carry over attempt count from any existing unexpired OTP
    let carryOverAttempts = 0;
    const existingResult = await this.otpRepo.findLatestByEmail(normalizedEmail);
    if (!isErr(existingResult) && existingResult.value) {
      const existing = existingResult.value;
      if (existing.expiresAt > new Date()) {
        carryOverAttempts = existing.attempts;
      }
    }

    // Delete old OTPs before creating the new one — ensures only one valid code
    await this.otpRepo.deleteByEmail(normalizedEmail);

    const useTestOtp = this.isTestEmail(normalizedEmail);
    const code = useTestOtp ? TEST_OTP_CODE : this.generateCode();
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000);

    const result = await this.otpRepo.create({
      email: normalizedEmail,
      codeHash,
      expiresAt,
      attempts: carryOverAttempts,
    });

    if (isErr(result)) {
      throw new InternalServerErrorException('Failed to create OTP');
    }

    if (useTestOtp) {
      this.logger.warn(`TEST OTP issued for ${normalizedEmail}`);
    } else {
      // Fire-and-forget — don't block the response on SMTP round-trip
      this.emailService.sendOtp(normalizedEmail, code, this.expiryMinutes).catch((error) => {
        this.logger.error(`Failed to send OTP email to ${normalizedEmail}`, error);
      });
    }

    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(email: string, code: string): Promise<VerifyOtpResult> {
    const normalizedEmail = email.toLowerCase();

    this.emailLockout.checkLockout(normalizedEmail);

    const findResult = await this.otpRepo.findLatestByEmail(normalizedEmail);
    if (isErr(findResult)) {
      throw new InternalServerErrorException('Failed to verify OTP');
    }

    const otp = findResult.value;

    if (!otp)
      throw new BadRequestException('No OTP found for this email. Please request a new one.');
    if (otp.expiresAt < new Date())
      throw new BadRequestException('OTP has expired. Please request a new one.');
    if (otp.attempts >= this.maxAttempts)
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');

    if (!this.verifyCode(code, otp.codeHash)) {
      this.emailLockout.recordFailure(normalizedEmail);
      await this.otpRepo.incrementAttempts(otp._id.toString());
      throw new BadRequestException('Invalid OTP code.');
    }

    // OTP verified — delete all OTPs for this email
    this.emailLockout.clearLockout(normalizedEmail);
    await this.otpRepo.deleteByEmail(normalizedEmail);

    return { email: normalizedEmail, valid: true };
  }

  private async checkRateLimit(email: string): Promise<void> {
    const since = new Date(Date.now() - this.rateLimitWindowMinutes * 60 * 1000);

    const countResult = await this.otpRepo.countRecentByEmail(email, since);
    if (isErr(countResult)) {
      throw new InternalServerErrorException('Failed to check rate limit');
    }

    if (countResult.value >= this.rateLimitMax) {
      throw new BadRequestException(
        `Too many OTP requests. Please wait ${this.rateLimitWindowMinutes} minutes before trying again.`
      );
    }
  }

  private generateCode(): string {
    // Generate a cryptographically random 6-digit code
    const buffer = crypto.randomBytes(4);
    const num = buffer.readUInt32BE(0) % 1000000;
    return num.toString().padStart(6, '0');
  }

  private hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private verifyCode(code: string, hash: string): boolean {
    const codeHash = this.hashCode(code);
    return crypto.timingSafeEqual(Buffer.from(codeHash, 'hex'), Buffer.from(hash, 'hex'));
  }
}
