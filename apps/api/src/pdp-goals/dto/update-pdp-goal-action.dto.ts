import { PdpGoalStatus } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UpdatePdpGoalActionSchema = z.object({
  status: z.nativeEnum(PdpGoalStatus).optional(),
  completionReview: z.string().nullable().optional(),
});

export class UpdatePdpGoalActionDto extends createZodDto(UpdatePdpGoalActionSchema) {}
