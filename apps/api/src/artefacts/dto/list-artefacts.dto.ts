import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ListArtefactsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.coerce.number().int().optional(),
});

export class ListArtefactsDto extends createZodDto(ListArtefactsSchema) {}
