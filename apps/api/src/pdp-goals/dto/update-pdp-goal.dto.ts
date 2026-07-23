import { UpdatePdpGoalRequestSchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class UpdatePdpGoalDto extends createZodDto(UpdatePdpGoalRequestSchema) {}
