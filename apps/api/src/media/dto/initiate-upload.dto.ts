import { createZodDto } from 'nestjs-zod';
import { InitiateUploadRequestSchema } from '@acme/shared';

export class InitiateUploadDto extends createZodDto(InitiateUploadRequestSchema) {}
