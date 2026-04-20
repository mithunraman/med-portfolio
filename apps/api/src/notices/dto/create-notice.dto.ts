import { CreateNoticeSchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class CreateNoticeDto extends createZodDto(CreateNoticeSchema) {}
