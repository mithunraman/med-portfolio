import { PdpGoalStatus } from '@acme/shared';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ListPdpGoalsSchema = z.object({
  status: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      return val
        .split(',')
        .map(Number)
        .filter((n) => Object.values(PdpGoalStatus).includes(n as PdpGoalStatus)) as PdpGoalStatus[];
    }),
});

export class ListPdpGoalsDto extends createZodDto(ListPdpGoalsSchema) {}
