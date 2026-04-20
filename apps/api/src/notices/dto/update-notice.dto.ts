import { UpdateNoticeSchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class UpdateNoticeDto extends createZodDto(UpdateNoticeSchema) {}
