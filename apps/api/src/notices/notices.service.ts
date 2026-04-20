import type { AdminNoticeResponse, AppNotice, CreateNoticeDto, UpdateNoticeDto } from '@acme/shared';
import { AudienceType, UserRole } from '@acme/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CreateNoticeData, NoticesRepository } from './notices.repository';
import { Notice } from './schemas/notice.schema';

const MAX_NOTICES_PER_USER = 5;

const SEVERITY_ORDER = { critical: 3, warning: 2, info: 1 } as const;

@Injectable()
export class NoticesService {
  constructor(private readonly repository: NoticesRepository) {}

  async getNoticesForUser(userId: Types.ObjectId, role: UserRole): Promise<AppNotice[]> {
    const result = await this.repository.findActive(new Date());
    if (!result.ok) return [];

    const notices = result.value;

    // Filter by audience
    const relevant = notices.filter((notice) => {
      if (notice.audienceType === AudienceType.ALL) return true;
      if (notice.audienceType === AudienceType.ROLE && notice.audienceRoles) {
        return notice.audienceRoles.includes(role);
      }
      if (notice.audienceType === AudienceType.USERS && notice.audienceUserIds) {
        return notice.audienceUserIds.includes(userId.toString());
      }
      return false;
    });

    if (relevant.length === 0) return [];

    // Filter out dismissed
    const noticeObjectIds = relevant.map((n) => n._id);
    const dismissalResult = await this.repository.findDismissals(userId, noticeObjectIds);
    const dismissedIds = new Set(
      dismissalResult.ok
        ? dismissalResult.value.map((d) => d.noticeId.toString())
        : []
    );

    const undismissed = relevant.filter((n) => !dismissedIds.has(n._id.toString()));

    // Sort by priority desc, then severity
    undismissed.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0);
    });

    // Cap at max
    return undismissed.slice(0, MAX_NOTICES_PER_USER).map((n) => ({
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
    }));
  }

  async dismiss(userId: Types.ObjectId, noticeXid: string): Promise<void> {
    const result = await this.repository.findByXid(noticeXid);
    if (!result.ok || !result.value) {
      throw new NotFoundException('Notice not found');
    }

    if (!result.value.dismissible) {
      throw new BadRequestException('Notice is not dismissible');
    }

    await this.repository.upsertDismissal(userId, result.value._id);
  }

  // Admin methods

  async adminList(filter: { active?: boolean }, page: number, limit: number): Promise<{ items: AdminNoticeResponse[]; total: number }> {
    const skip = (page - 1) * limit;
    const result = await this.repository.findAll(filter, skip, limit);
    if (!result.ok) return { items: [], total: 0 };

    return {
      items: result.value.docs.map((n) => this.toAdminResponse(n)),
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

    if (!result.ok) {
      throw new BadRequestException('Failed to create notice');
    }

    return this.toAdminResponse(result.value);
  }

  async adminUpdate(xid: string, dto: UpdateNoticeDto): Promise<AdminNoticeResponse> {
    const { startsAt, expiresAt, ...rest } = dto;
    const data: Partial<CreateNoticeData> = {
      ...rest,
      ...(startsAt != null && { startsAt: new Date(startsAt) }),
      ...(expiresAt != null && { expiresAt: new Date(expiresAt) }),
    };

    const result = await this.repository.update(xid, data);
    if (!result.ok || !result.value) {
      throw new NotFoundException('Notice not found');
    }

    return this.toAdminResponse(result.value);
  }

  async adminDelete(xid: string): Promise<void> {
    const result = await this.repository.delete(xid);
    if (!result.ok || !result.value) {
      throw new NotFoundException('Notice not found');
    }
  }

  private toAdminResponse(n: Notice): AdminNoticeResponse {
    return {
      id: n.xid,
      type: n.type,
      severity: n.severity,
      title: n.title,
      body: n.body ?? undefined,
      actionUrl: n.actionUrl ?? undefined,
      actionLabel: n.actionLabel ?? undefined,
      dismissible: n.dismissible,
      startsAt: n.startsAt instanceof Date ? n.startsAt.toISOString() : n.startsAt,
      expiresAt: n.expiresAt instanceof Date ? n.expiresAt.toISOString() : n.expiresAt ?? undefined,
      active: n.active,
      audienceType: n.audienceType,
      audienceRoles: n.audienceRoles,
      audienceUserIds: n.audienceUserIds,
      priority: n.priority,
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
      updatedAt: n.updatedAt instanceof Date ? n.updatedAt.toISOString() : n.updatedAt,
    };
  }
}
