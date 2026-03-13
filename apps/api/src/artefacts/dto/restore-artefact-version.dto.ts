import { createZodDto } from 'nestjs-zod';
import { RestoreArtefactVersionRequestSchema } from '@acme/shared';

export class RestoreArtefactVersionDto extends createZodDto(RestoreArtefactVersionRequestSchema) {}
