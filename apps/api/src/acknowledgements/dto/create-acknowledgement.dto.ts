import { createAcknowledgementRequestSchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateAcknowledgementDto extends createZodDto(createAcknowledgementRequestSchema) {}
