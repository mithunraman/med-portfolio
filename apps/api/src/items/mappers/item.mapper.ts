import type { Item } from '@acme/shared';
import type { ItemDocument } from '../schemas/item.schema';

export function toItemDto(doc: ItemDocument): Item {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
