import { UpdatePdpGoalActionRequestSchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class UpdatePdpGoalActionDto extends createZodDto(UpdatePdpGoalActionRequestSchema) {}
