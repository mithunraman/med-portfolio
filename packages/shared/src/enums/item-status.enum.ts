export enum ItemStatus {
  DRAFT = 0,
  ACTIVE = 1,
  ARCHIVED = 2,
}

export const ItemStatusLabels: Record<ItemStatus, string> = {
  [ItemStatus.DRAFT]: 'Draft',
  [ItemStatus.ACTIVE]: 'Active',
  [ItemStatus.ARCHIVED]: 'Archived',
};
