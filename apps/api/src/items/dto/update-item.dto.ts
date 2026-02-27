import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UpdateItemSchema, ItemStatus } from '@acme/shared';

export class UpdateItemDto extends createZodDto(UpdateItemSchema) {}

const UpdateItemStatusSchema = z.object({
  status: z.nativeEnum(ItemStatus),
});

export class UpdateItemStatusDto extends createZodDto(UpdateItemStatusSchema) {}
