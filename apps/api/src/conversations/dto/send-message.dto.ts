import { SendMessageRequestSchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class SendMessageDto extends createZodDto(SendMessageRequestSchema) {}
