import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
    OtpService,
  ],
  exports: [OtpService],
})
export class OtpModule {}
