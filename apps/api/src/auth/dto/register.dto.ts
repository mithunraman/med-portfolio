import { createZodDto } from 'nestjs-zod';
import { RegisterRequestSchema } from '@acme/shared';

export class RegisterDto extends createZodDto(RegisterRequestSchema) {}
