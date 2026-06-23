import { createZodDto } from 'nestjs-zod';
import { UpdateNotesRequestSchema } from '@acme/shared';

export class UpdateNotesDto extends createZodDto(UpdateNotesRequestSchema) {}
