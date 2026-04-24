import { RefreshTokenRequestSchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class RefreshTokenDto extends createZodDto(RefreshTokenRequestSchema) {}
