import { createZodDto } from 'nestjs-zod';
import { FinaliseArtefactRequestSchema } from '@acme/shared';

export class FinaliseArtefactDto extends createZodDto(FinaliseArtefactRequestSchema) {}
