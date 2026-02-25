import type { Item } from '@acme/shared';
import type { Item as ItemSchema } from '../schemas/item.schema';

export function toItemDto(doc: ItemSchema): Item {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
