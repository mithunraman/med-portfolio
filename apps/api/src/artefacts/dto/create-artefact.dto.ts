import { createZodDto } from 'nestjs-zod';
import { CreateArtefactRequestSchema } from '@acme/shared';

export class CreateArtefactDto extends createZodDto(CreateArtefactRequestSchema) {}
