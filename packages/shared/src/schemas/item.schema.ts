import { z } from 'zod';
import { ItemStatus } from '../enums/item-status.enum';

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.nativeEnum(ItemStatus),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Item = z.infer<typeof ItemSchema>;

export const CreateItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

export type CreateItemDto = z.infer<typeof CreateItemSchema>;

export const UpdateItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.nativeEnum(ItemStatus).optional(),
});

export type UpdateItemDto = z.infer<typeof UpdateItemSchema>;

export const ItemListResponseSchema = z.object({
  items: z.array(ItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type ItemListResponse = z.infer<typeof ItemListResponseSchema>;
