import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailLockoutService } from './email-lockout.service';
import { Otp, OtpSchema } from './schemas/otp.schema';
import { OtpRepository } from './otp.repository';
import { OtpService } from './otp.service';
import { OTP_REPOSITORY } from './otp.repository.interface';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Otp.name, schema: OtpSchema }]),
  ],
  providers: [
    {
      provide: OTP_REPOSITORY,
      useClass: OtpRepository,
    },
    EmailLockoutService,
    OtpService,
  ],
  exports: [OtpService],
})
export class OtpModule {}
