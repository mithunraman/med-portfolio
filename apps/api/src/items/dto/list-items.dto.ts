import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ItemStatus } from '@acme/shared';

const ListItemsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.coerce.number().pipe(z.nativeEnum(ItemStatus)).optional(),
});

export class ListItemsDto extends createZodDto(ListItemsSchema) {}
