import { createZodDto } from 'nestjs-zod';
import { EditArtefactRequestSchema } from '@acme/shared';

export class EditArtefactDto extends createZodDto(EditArtefactRequestSchema) {}
