import { z } from 'zod';
import { AudienceType } from '../enums/audience-type.enum';
import { NoticeSeverity } from '../enums/notice-severity.enum';
import { NoticeType } from '../enums/notice-type.enum';
import { UserRole } from '../enums/user-role.enum';

export const AppNoticeSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(NoticeType),
  severity: z.nativeEnum(NoticeSeverity),
  title: z.string(),
  body: z.string().optional(),
  actionUrl: z.string().optional(),
  actionLabel: z.string().optional(),
  dismissible: z.boolean(),
  startsAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});

export type AppNotice = z.infer<typeof AppNoticeSchema>;

export const CreateNoticeSchema = z
  .object({
    type: z.nativeEnum(NoticeType),
    severity: z.nativeEnum(NoticeSeverity),
    title: z.string().min(1).max(200),
    body: z.string().max(1000).optional(),
    actionUrl: z.string().url().optional(),
    actionLabel: z.string().max(50).optional(),
    dismissible: z.boolean(),
    startsAt: z.string().datetime(),
    expiresAt: z.string().datetime().optional(),
    active: z.boolean().default(true),
    audienceType: z.nativeEnum(AudienceType),
    audienceRoles: z.array(z.nativeEnum(UserRole)).optional(),
    audienceUserIds: z.array(z.string()).optional(),
    priority: z.number().int().min(0).max(100).default(0),
  })
  .refine(
    (data) => {
      if (data.expiresAt && data.startsAt >= data.expiresAt) return false;
      return true;
    },
    { message: 'expiresAt must be after startsAt' }
  )
  .refine(
    (data) => {
      if (data.audienceType === AudienceType.ROLE && (!data.audienceRoles || data.audienceRoles.length === 0))
        return false;
      return true;
    },
    { message: 'audienceRoles is required when audienceType is role' }
  )
  .refine(
    (data) => {
      if (data.audienceType === AudienceType.USERS && (!data.audienceUserIds || data.audienceUserIds.length === 0))
        return false;
      return true;
    },
    { message: 'audienceUserIds is required when audienceType is users' }
  );

export type CreateNoticeDto = z.infer<typeof CreateNoticeSchema>;

export const UpdateNoticeSchema = z
  .object({
    type: z.nativeEnum(NoticeType).optional(),
    severity: z.nativeEnum(NoticeSeverity).optional(),
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(1000).optional(),
    actionUrl: z.string().url().optional(),
    actionLabel: z.string().max(50).optional(),
    dismissible: z.boolean().optional(),
    startsAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    active: z.boolean().optional(),
    audienceType: z.nativeEnum(AudienceType).optional(),
    audienceRoles: z.array(z.nativeEnum(UserRole)).optional(),
    audienceUserIds: z.array(z.string()).optional(),
    priority: z.number().int().min(0).max(100).optional(),
  })
  .refine(
    (data) => {
      if (data.expiresAt && data.startsAt && data.startsAt >= data.expiresAt) return false;
      return true;
    },
    { message: 'expiresAt must be after startsAt' }
  );

export type UpdateNoticeDto = z.infer<typeof UpdateNoticeSchema>;

export const AdminNoticeResponseSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(NoticeType),
  severity: z.nativeEnum(NoticeSeverity),
  title: z.string(),
  body: z.string().optional(),
  actionUrl: z.string().optional(),
  actionLabel: z.string().optional(),
  dismissible: z.boolean(),
  startsAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  active: z.boolean(),
  audienceType: z.nativeEnum(AudienceType),
  audienceRoles: z.array(z.nativeEnum(UserRole)).optional(),
  audienceUserIds: z.array(z.string()).optional(),
  priority: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AdminNoticeResponse = z.infer<typeof AdminNoticeResponseSchema>;
