import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { buildOtpEmail } from './templates/otp.template';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('app.smtp.host');
    const port = this.configService.get<number>('app.smtp.port');
    const user = this.configService.get<string>('app.smtp.user');
    const pass = this.configService.get<string>('app.smtp.pass');
    this.from = this.configService.get<string>('app.smtp.from', user ?? '');

    this.isEnabled = !!(host && user && pass);

    if (this.isEnabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port: port ?? 587,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP not configured — email sending is disabled');
      this.transporter = null as any;
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verified');
    } catch (error) {
      this.logger.error('SMTP connection verification failed — emails will not be sent', error);
    }
  }

  async sendOtp(to: string, code: string, expiryMinutes: number): Promise<void> {
    if (this.isEnabled) {
      this.logger.warn(`Email disabled — OTP for ${to} not sent`);
      return;
    }

    const { html, text } = buildOtpEmail({ code, expiryMinutes });

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `${code} is your verification code`,
      html,
      text,
    });

    this.logger.log(`OTP email sent to ${to}`);
  }
}
