import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AddPdpGoalActionSchema = z.object({
  action: z.string().min(1),
});

export class AddPdpGoalActionDto extends createZodDto(AddPdpGoalActionSchema) {}
