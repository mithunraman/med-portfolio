import { PdpGoalStatus } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UpdatePdpGoalSchema = z.object({
  reviewDate: z.string().datetime().nullable().optional(),
  status: z.nativeEnum(PdpGoalStatus).optional(),
  completionReview: z.string().nullable().optional(),
});

export class UpdatePdpGoalDto extends createZodDto(UpdatePdpGoalSchema) {}
