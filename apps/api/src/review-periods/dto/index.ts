import { createZodDto } from 'nestjs-zod';
import {
  CreateReviewPeriodRequestSchema,
  UpdateReviewPeriodRequestSchema,
} from '@acme/shared';

export class CreateReviewPeriodDto extends createZodDto(CreateReviewPeriodRequestSchema) {}
export class UpdateReviewPeriodDto extends createZodDto(UpdateReviewPeriodRequestSchema) {}
