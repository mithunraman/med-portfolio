import { EditMessageRequestSchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class EditMessageDto extends createZodDto(EditMessageRequestSchema) {}
