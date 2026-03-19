import { createZodDto } from 'nestjs-zod';
import { OtpClaimRequestSchema } from '@acme/shared';

export class OtpClaimDto extends createZodDto(OtpClaimRequestSchema) {}
