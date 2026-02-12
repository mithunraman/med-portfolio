export enum UserRole {
  USER_GUEST = -1,
  USER = 0,
  ADMIN = 1,
  SUPER_ADMIN = 2,
}

export const UserRoleLabels: Record<UserRole, string> = {
  [UserRole.USER_GUEST]: 'Guest',
  [UserRole.USER]: 'User',
  [UserRole.ADMIN]: 'Admin',
  [UserRole.SUPER_ADMIN]: 'Super Admin',
};
