import { createZodDto } from 'nestjs-zod';
import { UpdateProfileRequestSchema } from '@acme/shared';

export class UpdateProfileDto extends createZodDto(UpdateProfileRequestSchema) {}
