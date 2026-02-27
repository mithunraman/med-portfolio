import { createZodDto } from 'nestjs-zod';
import { LoginRequestSchema } from '@acme/shared';

export class LoginDto extends createZodDto(LoginRequestSchema) {}
