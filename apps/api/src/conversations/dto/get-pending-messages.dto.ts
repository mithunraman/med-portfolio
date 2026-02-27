import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const GetPendingMessagesSchema = z.object({
  ids: z.preprocess(
    (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') return val.split(',').filter(Boolean);
      return [];
    },
    z.array(z.string()).nonempty().max(100),
  ),
});

export class GetPendingMessagesDto extends createZodDto(GetPendingMessagesSchema) {}
