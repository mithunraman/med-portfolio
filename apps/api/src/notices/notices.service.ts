import type { AdminNoticeResponse, AppNotice, CreateNoticeDto, UpdateNoticeDto } from '@acme/shared';
import { AudienceType, NoticeSeverity, UserRole } from '@acme/shared';
import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Types, isValidObjectId } from 'mongoose';
import { isErr } from '../common/utils/result.util';
import { CreateNoticeData, NoticesRepository } from './notices.repository';
import { Notice } from './schemas/notice.schema';

const MAX_NOTICES_PER_USER = 5;

const SEVERITY_ORDER: Record<NoticeSeverity, number> = {
  [NoticeSeverity.CRITICAL]: 3,
  [NoticeSeverity.WARNING]: 2,
  [NoticeSeverity.INFO]: 1,
};

function toAppNotice(n: Notice): AppNotice {
  return {
    id: n.xid,
    type: n.type,
    severity: n.severity,
    title: n.title,
    body: n.body ?? undefined,
    actionUrl: n.actionUrl ?? undefined,
    actionLabel: n.actionLabel ?? undefined,
    dismissible: n.dismissible,
    startsAt: n.startsAt.toISOString(),
    expiresAt: n.expiresAt?.toISOString(),
  };
}

function toAdminResponse(n: Notice): AdminNoticeResponse {
  return {
    id: n.xid,
    type: n.type,
    severity: n.severity,
    title: n.title,
    body: n.body ?? undefined,
    actionUrl: n.actionUrl ?? undefined,
    actionLabel: n.actionLabel ?? undefined,
    dismissible: n.dismissible,
    startsAt: n.startsAt.toISOString(),
    expiresAt: n.expiresAt?.toISOString(),
    active: n.active,
    audienceType: n.audienceType,
    audienceRoles: n.audienceRoles,
    audienceUserIds: n.audienceUserIds,
    priority: n.priority,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}

@Injectable()
export class NoticesService {
  constructor(private readonly repository: NoticesRepository) {}

  async getNoticesForUser(userId: string, role: UserRole): Promise<AppNotice[]> {
    if (!isValidObjectId(userId)) throw new BadRequestException('Invalid user id');
    const userObjectId = new Types.ObjectId(userId);

    const result = await this.repository.findActive(new Date());
    if (isErr(result)) throw new InternalServerErrorException(result.error.message);

    const relevant = result.value.filter((notice) => {
      if (notice.audienceType === AudienceType.ALL) return true;
      if (notice.audienceType === AudienceType.ROLE && notice.audienceRoles) {
        return notice.audienceRoles.includes(role);
      }
      if (notice.audienceType === AudienceType.USERS && notice.audienceUserIds) {
        return notice.audienceUserIds.includes(userId);
      }
      return false;
    });

    if (relevant.length === 0) return [];

    const noticeObjectIds = relevant.map((n) => n._id);
    const dismissalResult = await this.repository.findDismissals(userObjectId, noticeObjectIds);
    if (isErr(dismissalResult)) throw new InternalServerErrorException(dismissalResult.error.message);

    const dismissedIds = new Set(dismissalResult.value.map((d) => d.noticeId.toString()));
    const undismissed = relevant.filter((n) => !dismissedIds.has(n._id.toString()));

    undismissed.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    });

    return undismissed.slice(0, MAX_NOTICES_PER_USER).map(toAppNotice);
  }

  async dismiss(userId: string, noticeXid: string): Promise<void> {
    if (!isValidObjectId(userId)) throw new BadRequestException('Invalid user id');

    const result = await this.repository.findByXid(noticeXid);
    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('Notice not found');

    const dismissalResult = await this.repository.upsertDismissal(
      new Types.ObjectId(userId),
      result.value._id
    );
    if (isErr(dismissalResult)) throw new InternalServerErrorException(dismissalResult.error.message);
  }

  // Admin methods

  async adminList(
    filter: { active?: boolean },
    page: number,
    limit: number
  ): Promise<{ items: AdminNoticeResponse[]; total: number }> {
    const skip = (page - 1) * limit;
    const result = await this.repository.findAll(filter, skip, limit);
    if (isErr(result)) throw new InternalServerErrorException(result.error.message);

    return {
      items: result.value.docs.map(toAdminResponse),
      total: result.value.total,
    };
  }

  async adminCreate(dto: CreateNoticeDto): Promise<AdminNoticeResponse> {
    const result = await this.repository.create({
      type: dto.type,
      severity: dto.severity,
      title: dto.title,
      body: dto.body,
      actionUrl: dto.actionUrl,
      actionLabel: dto.actionLabel,
      dismissible: dto.dismissible,
      startsAt: new Date(dto.startsAt),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      active: dto.active,
      audienceType: dto.audienceType,
      audienceRoles: dto.audienceRoles,
      audienceUserIds: dto.audienceUserIds,
      priority: dto.priority,
    });

    if (isErr(result)) throw new InternalServerErrorException(result.error.message);

    return toAdminResponse(result.value);
  }

  async adminUpdate(xid: string, dto: UpdateNoticeDto): Promise<AdminNoticeResponse> {
    const { startsAt, expiresAt, ...rest } = dto;
    const data: Partial<CreateNoticeData> = {
      ...rest,
      ...(startsAt != null && { startsAt: new Date(startsAt) }),
      ...(expiresAt === null ? { expiresAt: null } : expiresAt != null ? { expiresAt: new Date(expiresAt) } : {}),
    };

    const result = await this.repository.update(xid, data);
    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('Notice not found');

    return toAdminResponse(result.value);
  }

  async adminDelete(xid: string): Promise<void> {
    const result = await this.repository.delete(xid);
    if (isErr(result)) throw new InternalServerErrorException(result.error.message);
    if (!result.value) throw new NotFoundException('Notice not found');
  }
}
