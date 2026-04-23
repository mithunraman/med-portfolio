import { AudienceType, NoticeSeverity, NoticeType, UserRole } from '@acme/shared';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
import { NoticesService } from '../notices.service';
import { Notice } from '../schemas/notice.schema';

// ── Helpers ──

const userObjectId = new Types.ObjectId();
const userIdStr = userObjectId.toString();

function createMockRepo() {
  return {
    findActive: jest.fn().mockResolvedValue(ok([])),
    findAll: jest.fn().mockResolvedValue(ok({ docs: [], total: 0 })),
    findByXid: jest.fn().mockResolvedValue(ok(null)),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findDismissals: jest.fn().mockResolvedValue(ok([])),
    upsertDismissal: jest.fn().mockResolvedValue(ok({})),
  };
}

function createService(repo = createMockRepo()) {
  return { service: new NoticesService(repo as any), repo };
}

let xidCounter = 0;
function buildNotice(overrides: Partial<Notice> = {}): Notice {
  xidCounter += 1;
  return {
    _id: new Types.ObjectId(),
    xid: `not_${xidCounter.toString().padStart(6, '0')}`,
    type: NoticeType.BANNER,
    severity: NoticeSeverity.INFO,
    title: 'Test notice',
    body: null,
    actionUrl: null,
    actionLabel: null,
    dismissible: true,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: null,
    active: true,
    audienceType: AudienceType.ALL,
    audienceRoles: undefined,
    audienceUserIds: undefined,
    priority: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as Notice;
}

// ── Tests ──

describe('NoticesService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    xidCounter = 0;
  });

  // ─────────────────────────────────────────────────────
  // getNoticesForUser — input validation & empty paths
  // ─────────────────────────────────────────────────────

  describe('getNoticesForUser — guards & empty paths', () => {
    it('U-N-01: throws BadRequestException when userId is not a valid ObjectId', async () => {
      const { service, repo } = createService();

      await expect(service.getNoticesForUser('not-an-objectid', UserRole.USER)).rejects.toThrow(
        BadRequestException
      );
      expect(repo.findActive).not.toHaveBeenCalled();
    });

    it('U-N-02: returns [] when no active notices exist; does not call findDismissals', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(ok([]));

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result).toEqual([]);
      expect(repo.findDismissals).not.toHaveBeenCalled();
    });

    it('U-N-17: throws InternalServerErrorException when findActive errors', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      await expect(service.getNoticesForUser(userIdStr, UserRole.USER)).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('U-N-18: throws InternalServerErrorException when findDismissals errors', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(ok([buildNotice()]));
      repo.findDismissals.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      await expect(service.getNoticesForUser(userIdStr, UserRole.USER)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  // ─────────────────────────────────────────────────────
  // getNoticesForUser — audience filtering
  // ─────────────────────────────────────────────────────

  describe('getNoticesForUser — audience filtering', () => {
    it('U-N-03: AudienceType.ALL is returned to every user', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(
        ok([buildNotice({ audienceType: AudienceType.ALL })])
      );

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result).toHaveLength(1);
    });

    it('U-N-04: AudienceType.ROLE keeps notice when user role is in audienceRoles', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(
        ok([
          buildNotice({
            audienceType: AudienceType.ROLE,
            audienceRoles: [UserRole.ADMIN],
          }),
        ])
      );

      const result = await service.getNoticesForUser(userIdStr, UserRole.ADMIN);

      expect(result).toHaveLength(1);
    });

    it('U-N-05: AudienceType.ROLE drops notice when user role not in audienceRoles', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(
        ok([
          buildNotice({
            audienceType: AudienceType.ROLE,
            audienceRoles: [UserRole.ADMIN],
          }),
        ])
      );

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result).toEqual([]);
    });

    it('U-N-06: AudienceType.ROLE with undefined audienceRoles drops notice', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(
        ok([
          buildNotice({
            audienceType: AudienceType.ROLE,
            audienceRoles: undefined,
          }),
        ])
      );

      const result = await service.getNoticesForUser(userIdStr, UserRole.ADMIN);

      expect(result).toEqual([]);
    });

    it('U-N-07: AudienceType.USERS keeps notice when userId is in audienceUserIds', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(
        ok([
          buildNotice({
            audienceType: AudienceType.USERS,
            audienceUserIds: [userIdStr, new Types.ObjectId().toString()],
          }),
        ])
      );

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result).toHaveLength(1);
    });

    it('U-N-08: AudienceType.USERS drops notice when userId is not in list', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(
        ok([
          buildNotice({
            audienceType: AudienceType.USERS,
            audienceUserIds: [new Types.ObjectId().toString()],
          }),
        ])
      );

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result).toEqual([]);
    });

    it('U-N-09: AudienceType.USERS with undefined audienceUserIds drops notice', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(
        ok([
          buildNotice({
            audienceType: AudienceType.USERS,
            audienceUserIds: undefined,
          }),
        ])
      );

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result).toEqual([]);
    });

    it('U-N-10: unknown AudienceType value drops notice', async () => {
      const { service, repo } = createService();
      repo.findActive.mockResolvedValue(
        ok([buildNotice({ audienceType: 'something_else' as any })])
      );

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────
  // getNoticesForUser — dismissals, sort, cap, mapping
  // ─────────────────────────────────────────────────────

  describe('getNoticesForUser — dismissals, sort, cap, mapping', () => {
    it('U-N-11: dismissed notice is filtered out', async () => {
      const { service, repo } = createService();
      const a = buildNotice({ xid: 'not_a' });
      const b = buildNotice({ xid: 'not_b' });
      repo.findActive.mockResolvedValue(ok([a, b]));
      repo.findDismissals.mockResolvedValue(ok([{ noticeId: a._id } as any]));

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('not_b');
    });

    it('U-N-12: findDismissals called with userId ObjectId and all candidate _ids', async () => {
      const { service, repo } = createService();
      const a = buildNotice();
      const b = buildNotice();
      const c = buildNotice();
      repo.findActive.mockResolvedValue(ok([a, b, c]));
      repo.findDismissals.mockResolvedValue(ok([]));

      await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(repo.findDismissals).toHaveBeenCalledTimes(1);
      const [passedUserId, passedNoticeIds] = repo.findDismissals.mock.calls[0];
      expect(passedUserId).toBeInstanceOf(Types.ObjectId);
      expect(passedUserId.toString()).toBe(userIdStr);
      expect(passedNoticeIds).toHaveLength(3);
      expect(passedNoticeIds.map((id: Types.ObjectId) => id.toString())).toEqual([
        a._id.toString(),
        b._id.toString(),
        c._id.toString(),
      ]);
    });

    it('U-N-13: sorts by priority desc when severities are equal', async () => {
      const { service, repo } = createService();
      const low = buildNotice({ xid: 'not_low', priority: 1 });
      const high = buildNotice({ xid: 'not_high', priority: 5 });
      repo.findActive.mockResolvedValue(ok([low, high]));

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result.map((n) => n.id)).toEqual(['not_high', 'not_low']);
    });

    it('U-N-14: severity tiebreaker when priority is equal (CRITICAL > WARNING > INFO)', async () => {
      const { service, repo } = createService();
      const info = buildNotice({ xid: 'not_info', severity: NoticeSeverity.INFO });
      const warning = buildNotice({ xid: 'not_warn', severity: NoticeSeverity.WARNING });
      const critical = buildNotice({ xid: 'not_crit', severity: NoticeSeverity.CRITICAL });
      repo.findActive.mockResolvedValue(ok([info, warning, critical]));

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result.map((n) => n.id)).toEqual(['not_crit', 'not_warn', 'not_info']);
    });

    it('U-N-15: caps result at 5 notices', async () => {
      const { service, repo } = createService();
      const notices = Array.from({ length: 7 }, (_, i) =>
        buildNotice({ xid: `not_${i}`, priority: 100 - i })
      );
      repo.findActive.mockResolvedValue(ok(notices));

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result).toHaveLength(5);
      expect(result.map((n) => n.id)).toEqual(['not_0', 'not_1', 'not_2', 'not_3', 'not_4']);
    });

    it('U-N-16: maps Notice → AppNotice (xid→id, dates→ISO, null→undefined)', async () => {
      const { service, repo } = createService();
      const startsAt = new Date('2026-04-01T12:00:00Z');
      const notice = buildNotice({
        xid: 'not_map_001',
        startsAt,
        expiresAt: null,
        body: null,
        actionUrl: null,
        actionLabel: null,
      });
      repo.findActive.mockResolvedValue(ok([notice]));

      const result = await service.getNoticesForUser(userIdStr, UserRole.USER);

      expect(result[0]).toEqual({
        id: 'not_map_001',
        type: NoticeType.BANNER,
        severity: NoticeSeverity.INFO,
        title: 'Test notice',
        body: undefined,
        actionUrl: undefined,
        actionLabel: undefined,
        dismissible: true,
        startsAt: startsAt.toISOString(),
        expiresAt: undefined,
      });
    });
  });

  // ─────────────────────────────────────────────────────
  // dismiss
  // ─────────────────────────────────────────────────────

  describe('dismiss', () => {
    it('U-N-19: throws BadRequestException when userId is invalid', async () => {
      const { service, repo } = createService();

      await expect(service.dismiss('bad', 'not_xid')).rejects.toThrow(BadRequestException);
      expect(repo.findByXid).not.toHaveBeenCalled();
    });

    it('U-N-20: throws NotFoundException when notice xid does not exist', async () => {
      const { service, repo } = createService();
      repo.findByXid.mockResolvedValue(ok(null));

      await expect(service.dismiss(userIdStr, 'not_missing')).rejects.toThrow(NotFoundException);
      expect(repo.upsertDismissal).not.toHaveBeenCalled();
    });

    it('U-N-21: calls upsertDismissal with correct userId ObjectId and notice _id', async () => {
      const { service, repo } = createService();
      const notice = buildNotice();
      repo.findByXid.mockResolvedValue(ok(notice));
      repo.upsertDismissal.mockResolvedValue(ok({}));

      await service.dismiss(userIdStr, notice.xid);

      expect(repo.upsertDismissal).toHaveBeenCalledTimes(1);
      const [passedUserId, passedNoticeId] = repo.upsertDismissal.mock.calls[0];
      expect(passedUserId).toBeInstanceOf(Types.ObjectId);
      expect(passedUserId.toString()).toBe(userIdStr);
      expect(passedNoticeId).toBe(notice._id);
    });

    it('U-N-22: throws InternalServerErrorException when findByXid errors', async () => {
      const { service, repo } = createService();
      repo.findByXid.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      await expect(service.dismiss(userIdStr, 'not_x')).rejects.toThrow(
        InternalServerErrorException
      );
    });

    it('U-N-23: throws InternalServerErrorException when upsertDismissal errors', async () => {
      const { service, repo } = createService();
      repo.findByXid.mockResolvedValue(ok(buildNotice()));
      repo.upsertDismissal.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      await expect(service.dismiss(userIdStr, 'not_x')).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  // ─────────────────────────────────────────────────────
  // adminList
  // ─────────────────────────────────────────────────────

  describe('adminList', () => {
    it('U-N-24: computes skip from page and limit', async () => {
      const { service, repo } = createService();
      repo.findAll.mockResolvedValue(ok({ docs: [], total: 0 }));

      await service.adminList({}, 3, 20);

      expect(repo.findAll).toHaveBeenCalledWith({}, 40, 20);
    });

    it('U-N-25: passes filter through', async () => {
      const { service, repo } = createService();
      repo.findAll.mockResolvedValue(ok({ docs: [], total: 0 }));

      await service.adminList({ active: true }, 1, 10);

      expect(repo.findAll).toHaveBeenCalledWith({ active: true }, 0, 10);
    });

    it('U-N-26: returns {items, total} mapped to AdminNoticeResponse', async () => {
      const { service, repo } = createService();
      const notice = buildNotice({
        xid: 'not_admin_001',
        body: 'body',
        actionUrl: 'https://example.com',
        actionLabel: 'Open',
        expiresAt: new Date('2026-12-31T00:00:00Z'),
        active: true,
        audienceType: AudienceType.ROLE,
        audienceRoles: [UserRole.ADMIN],
        priority: 50,
      });
      repo.findAll.mockResolvedValue(ok({ docs: [notice], total: 42 }));

      const result = await service.adminList({}, 1, 20);

      expect(result.total).toBe(42);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'not_admin_001',
        body: 'body',
        actionUrl: 'https://example.com',
        actionLabel: 'Open',
        active: true,
        audienceType: AudienceType.ROLE,
        audienceRoles: [UserRole.ADMIN],
        priority: 50,
      });
      expect(result.items[0].createdAt).toBe(notice.createdAt.toISOString());
      expect(result.items[0].expiresAt).toBe(notice.expiresAt!.toISOString());
    });

    it('throws InternalServerErrorException on repo error', async () => {
      const { service, repo } = createService();
      repo.findAll.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      await expect(service.adminList({}, 1, 20)).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ─────────────────────────────────────────────────────
  // adminCreate
  // ─────────────────────────────────────────────────────

  describe('adminCreate', () => {
    const baseDto = {
      type: NoticeType.BANNER,
      severity: NoticeSeverity.INFO,
      title: 'New notice',
      dismissible: true,
      startsAt: '2026-04-01T00:00:00.000Z',
      active: true,
      audienceType: AudienceType.ALL,
      priority: 0,
    };

    it('U-N-27: converts startsAt and expiresAt strings to Date instances', async () => {
      const { service, repo } = createService();
      repo.create.mockResolvedValue(ok(buildNotice()));

      await service.adminCreate({
        ...baseDto,
        expiresAt: '2026-12-31T00:00:00.000Z',
      } as any);

      expect(repo.create).toHaveBeenCalledTimes(1);
      const payload = repo.create.mock.calls[0][0];
      expect(payload.startsAt).toBeInstanceOf(Date);
      expect(payload.startsAt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
      expect(payload.expiresAt).toBeInstanceOf(Date);
      expect(payload.expiresAt.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });

    it('U-N-28: passes undefined expiresAt when DTO omits it', async () => {
      const { service, repo } = createService();
      repo.create.mockResolvedValue(ok(buildNotice()));

      await service.adminCreate(baseDto as any);

      const payload = repo.create.mock.calls[0][0];
      expect(payload.expiresAt).toBeUndefined();
    });

    it('throws InternalServerErrorException on repo error', async () => {
      const { service, repo } = createService();
      repo.create.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      await expect(service.adminCreate(baseDto as any)).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });

  // ─────────────────────────────────────────────────────
  // adminUpdate
  // ─────────────────────────────────────────────────────

  describe('adminUpdate', () => {
    it('U-N-29: preserves expiresAt when omitted (no key in payload)', async () => {
      const { service, repo } = createService();
      repo.update.mockResolvedValue(ok(buildNotice()));

      await service.adminUpdate('not_x', {
        startsAt: '2026-05-01T00:00:00.000Z',
      } as any);

      const payload = repo.update.mock.calls[0][1];
      expect(payload).not.toHaveProperty('expiresAt');
      expect(payload.startsAt).toBeInstanceOf(Date);
    });

    it('U-N-30: sets expiresAt=null when DTO passes null', async () => {
      const { service, repo } = createService();
      repo.update.mockResolvedValue(ok(buildNotice()));

      await service.adminUpdate('not_x', { expiresAt: null } as any);

      const payload = repo.update.mock.calls[0][1];
      expect(payload).toHaveProperty('expiresAt', null);
    });

    it('U-N-31: converts expiresAt string to Date when provided', async () => {
      const { service, repo } = createService();
      repo.update.mockResolvedValue(ok(buildNotice()));

      await service.adminUpdate('not_x', {
        expiresAt: '2026-12-31T00:00:00.000Z',
      } as any);

      const payload = repo.update.mock.calls[0][1];
      expect(payload.expiresAt).toBeInstanceOf(Date);
      expect(payload.expiresAt.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });

    it('U-N-32: throws NotFoundException when xid not found', async () => {
      const { service, repo } = createService();
      repo.update.mockResolvedValue(ok(null));

      await expect(service.adminUpdate('not_missing', {} as any)).rejects.toThrow(
        NotFoundException
      );
    });

    it('passes through non-date fields untouched', async () => {
      const { service, repo } = createService();
      repo.update.mockResolvedValue(ok(buildNotice()));

      await service.adminUpdate('not_x', {
        title: 'New title',
        priority: 99,
        active: false,
      } as any);

      const payload = repo.update.mock.calls[0][1];
      expect(payload).toMatchObject({ title: 'New title', priority: 99, active: false });
    });
  });

  // ─────────────────────────────────────────────────────
  // adminDelete
  // ─────────────────────────────────────────────────────

  describe('adminDelete', () => {
    it('U-N-33: throws NotFoundException when xid not found', async () => {
      const { service, repo } = createService();
      repo.delete.mockResolvedValue(ok(false));

      await expect(service.adminDelete('not_missing')).rejects.toThrow(NotFoundException);
    });

    it('U-N-34: returns void on success', async () => {
      const { service, repo } = createService();
      repo.delete.mockResolvedValue(ok(true));

      await expect(service.adminDelete('not_x')).resolves.toBeUndefined();
    });

    it('throws InternalServerErrorException on repo error', async () => {
      const { service, repo } = createService();
      repo.delete.mockResolvedValue(err({ code: 'DB_ERROR', message: 'fail' }));

      await expect(service.adminDelete('not_x')).rejects.toThrow(InternalServerErrorException);
    });
  });
});
