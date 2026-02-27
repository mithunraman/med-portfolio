import { createZodDto } from 'nestjs-zod';
import { CreateItemSchema } from '@acme/shared';

export class CreateItemDto extends createZodDto(CreateItemSchema) {}
