import { createZodDto } from 'nestjs-zod';
import { UpdateArtefactStatusRequestSchema } from '@acme/shared';

export class UpdateArtefactStatusDto extends createZodDto(UpdateArtefactStatusRequestSchema) {}
