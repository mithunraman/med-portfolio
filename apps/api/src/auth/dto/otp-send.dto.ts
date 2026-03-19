import { createZodDto } from 'nestjs-zod';
import { OtpSendRequestSchema } from '@acme/shared';

export class OtpSendDto extends createZodDto(OtpSendRequestSchema) {}
