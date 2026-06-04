import { createZodDto } from 'nestjs-zod';
import { UpsertArtefactReviewRequestSchema } from '@acme/shared';

export class UpsertArtefactReviewDto extends createZodDto(UpsertArtefactReviewRequestSchema) {}
