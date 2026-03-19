import { createZodDto } from 'nestjs-zod';
import { OtpVerifyRequestSchema } from '@acme/shared';

export class OtpVerifyDto extends createZodDto(OtpVerifyRequestSchema) {}
