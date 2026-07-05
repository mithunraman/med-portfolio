import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { Resend } from 'resend';
import { buildOtpEmail } from './templates/otp.template';

/**
 * Thrown when a transactional email fails to send. Callers translate this into
 * a user-facing response; the failure is already logged + reported to Sentry here.
 */
export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('app.resend.apiKey');
    this.from = this.configService.get<string>('app.resend.from', '');

    this.client = apiKey ? new Resend(apiKey) : null;

    if (!this.client) {
      this.logger.warn('Resend not configured — email sending is disabled');
    }
  }

  /**
   * Send an OTP email. Throws {@link EmailSendError} on failure so the caller can
   * surface it to the user; the error is logged and reported to Sentry before throwing.
   * When Resend is not configured (local dev), this is a no-op and does not throw.
   */
  async sendOtp(to: string, code: string, expiryMinutes: number): Promise<void> {
    if (!this.client) {
      this.logger.warn(`Email disabled — OTP for ${to} not sent`);
      return;
    }

    const { html, text } = buildOtpEmail({ code, expiryMinutes });

    // A transport/network failure rejects the promise; a Resend API-level failure
    // resolves with a populated `error` field. Route both through one reporter.
    const result = await this.client.emails
      .send({
        from: this.from,
        to,
        subject: `${code} is your verification code`,
        html,
        text,
      })
      .catch((err: unknown) => {
        throw this.reportSendFailure(to, err);
      });

    if (result.error) {
      throw this.reportSendFailure(to, result.error, result.error.name);
    }

    this.logger.log(`OTP email sent to ${to} (id=${result.data?.id})`);
  }

  /**
   * Log a send failure, report it to Sentry, and return an EmailSendError for the
   * caller to throw. `resendErrorName` (e.g. 'validation_error') is attached as a
   * Sentry tag so failures can be grouped and filtered by type.
   */
  private reportSendFailure(to: string, cause: unknown, resendErrorName?: string): EmailSendError {
    // Keep the recipient (PII) out of the third-party Sentry sink — the failure type
    // (resend_error tag) + message are enough to triage. It stays in our own logs only,
    // and never in Sentry extra (we also run sendDefaultPii: false in instrument.ts).
    this.logger.error(`Failed to send OTP email to ${to}`, cause as Error);
    Sentry.captureException(cause, {
      tags: {
        component: 'email',
        provider: 'resend',
        purpose: 'otp',
        ...(resendErrorName ? { resend_error: resendErrorName } : {}),
      },
    });
    return new EmailSendError('Failed to send verification email');
  }
}
