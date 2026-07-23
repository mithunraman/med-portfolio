import { AddPdpGoalActionRequestSchema } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';

export class AddPdpGoalActionDto extends createZodDto(AddPdpGoalActionRequestSchema) {}
