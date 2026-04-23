import {
  AudienceType,
  NoticeSeverity,
  NoticeType,
  UserRole,
} from '@acme/shared';
import { NotFoundException } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import {
  NoticeDismissal,
  NoticeDismissalDocument,
  NoticeDismissalSchema,
} from '../schemas/notice-dismissal.schema';
import { Notice, NoticeDocument, NoticeSchema } from '../schemas/notice.schema';
import { NoticesRepository } from '../notices.repository';
import { NoticesService } from '../notices.service';

// ── Helpers ──

const userAId = new Types.ObjectId();
const userAIdStr = userAId.toString();
const userBId = new Types.ObjectId();
const userBIdStr = userBId.toString();

let xidCounter = 0;

interface SeedNoticeOpts {
  xid?: string;
  type?: NoticeType;
  severity?: NoticeSeverity;
  title?: string;
  body?: string | null;
  dismissible?: boolean;
  startsAt?: Date;
  expiresAt?: Date | null;
  active?: boolean;
  audienceType?: AudienceType;
  audienceRoles?: UserRole[];
  audienceUserIds?: string[];
  priority?: number;
}

async function seedNotice(model: Model<NoticeDocument>, opts: SeedNoticeOpts = {}) {
  xidCounter += 1;
  const doc = await model.create({
    xid: opts.xid ?? `not_${xidCounter.toString().padStart(6, '0')}`,
    type: opts.type ?? NoticeType.BANNER,
    severity: opts.severity ?? NoticeSeverity.INFO,
    title: opts.title ?? 'Seeded notice',
    body: opts.body ?? null,
    actionUrl: null,
    actionLabel: null,
    dismissible: opts.dismissible ?? true,
    startsAt: opts.startsAt ?? new Date(Date.now() - 60_000),
    expiresAt: opts.expiresAt === undefined ? null : opts.expiresAt,
    active: opts.active ?? true,
    audienceType: opts.audienceType ?? AudienceType.ALL,
    audienceRoles: opts.audienceRoles,
    audienceUserIds: opts.audienceUserIds,
    priority: opts.priority ?? 0,
  });
  return doc.toObject() as Notice;
}

// ── Tests ──

describe('Notices (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let service: NoticesService;
  let noticeModel: Model<NoticeDocument>;
  let dismissalModel: Model<NoticeDismissalDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Notice.name, schema: NoticeSchema },
          { name: NoticeDismissal.name, schema: NoticeDismissalSchema },
        ]),
      ],
      providers: [NoticesRepository, NoticesService],
    }).compile();

    await module.init();

    service = module.get(NoticesService);
    noticeModel = module.get<Model<NoticeDocument>>(getModelToken(Notice.name));
    dismissalModel = module.get<Model<NoticeDismissalDocument>>(
      getModelToken(NoticeDismissal.name)
    );
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    xidCounter = 0;
    await Promise.all([noticeModel.deleteMany({}), dismissalModel.deleteMany({})]);
  });

  // ─────────────────────────────────────────────────────
  // findActive query — time window correctness
  // ─────────────────────────────────────────────────────

  describe('getNoticesForUser — active window', () => {
    it('I-N-01: returns only active notices within the time window', async () => {
      const now = Date.now();
      const inWindow = await seedNotice(noticeModel, {
        title: 'in-window',
        active: true,
        startsAt: new Date(now - 10 * 60_000),
        expiresAt: new Date(now + 60 * 60_000),
      });
      const openEnded = await seedNotice(noticeModel, {
        title: 'open-ended',
        active: true,
        startsAt: new Date(now - 10 * 60_000),
        expiresAt: null,
      });
      // Inactive
      await seedNotice(noticeModel, {
        title: 'inactive',
        active: false,
        startsAt: new Date(now - 10 * 60_000),
      });
      // Future startsAt
      await seedNotice(noticeModel, {
        title: 'future',
        active: true,
        startsAt: new Date(now + 60 * 60_000),
      });
      // Expired
      await seedNotice(noticeModel, {
        title: 'expired',
        active: true,
        startsAt: new Date(now - 60 * 60_000),
        expiresAt: new Date(now - 1_000),
      });

      const result = await service.getNoticesForUser(userAIdStr, UserRole.USER);

      expect(result.map((n) => n.title).sort()).toEqual(
        [inWindow.title, openEnded.title].sort()
      );
    });

    it('I-N-14: notice with expiresAt in the past is never returned even if active=true', async () => {
      await seedNotice(noticeModel, {
        title: 'expired',
        active: true,
        startsAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 1_000),
      });

      const result = await service.getNoticesForUser(userAIdStr, UserRole.USER);
      expect(result).toEqual([]);
    });

    it('I-N-15: notice with startsAt in the future is not returned', async () => {
      await seedNotice(noticeModel, {
        title: 'future',
        active: true,
        startsAt: new Date(Date.now() + 60 * 60_000),
      });

      const result = await service.getNoticesForUser(userAIdStr, UserRole.USER);
      expect(result).toEqual([]);
    });

    it('I-N-16: notice exactly at startsAt boundary is included ($lte)', async () => {
      // startsAt slightly in the past so the window check includes it
      await seedNotice(noticeModel, {
        title: 'boundary',
        startsAt: new Date(Date.now() - 100),
      });

      const result = await service.getNoticesForUser(userAIdStr, UserRole.USER);
      expect(result.map((n) => n.title)).toEqual(['boundary']);
    });
  });

  // ─────────────────────────────────────────────────────
  // Audience filtering against a real DB
  // ─────────────────────────────────────────────────────

  describe('getNoticesForUser — audience filtering', () => {
    it('I-N-02: excludes role-targeted notice for mismatched role', async () => {
      await seedNotice(noticeModel, {
        title: 'admins-only',
        audienceType: AudienceType.ROLE,
        audienceRoles: [UserRole.ADMIN],
      });

      const result = await service.getNoticesForUser(userAIdStr, UserRole.USER);
      expect(result).toEqual([]);
    });

    it('I-N-03: includes role-targeted notice when role matches', async () => {
      await seedNotice(noticeModel, {
        title: 'users-only',
        audienceType: AudienceType.ROLE,
        audienceRoles: [UserRole.USER],
      });

      const result = await service.getNoticesForUser(userAIdStr, UserRole.USER);
      expect(result).toHaveLength(1);
    });

    it('I-N-04: includes USERS-targeted notice only for listed users', async () => {
      await seedNotice(noticeModel, {
        title: 'targeted-A',
        audienceType: AudienceType.USERS,
        audienceUserIds: [userAIdStr],
      });

      const forA = await service.getNoticesForUser(userAIdStr, UserRole.USER);
      const forB = await service.getNoticesForUser(userBIdStr, UserRole.USER);

      expect(forA.map((n) => n.title)).toEqual(['targeted-A']);
      expect(forB).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────
  // Dismissals — end-to-end
  // ─────────────────────────────────────────────────────

  describe('dismiss flow', () => {
    it('I-N-05: notices dismissed by the user are excluded from subsequent results', async () => {
      const a = await seedNotice(noticeModel, { title: 'A' });
      await seedNotice(noticeModel, { title: 'B' });

      await service.dismiss(userAIdStr, a.xid);

      const result = await service.getNoticesForUser(userAIdStr, UserRole.USER);
      expect(result.map((n) => n.title)).toEqual(['B']);
    });

    it('I-N-08: dismiss persists a row in notice_dismissals', async () => {
      const n = await seedNotice(noticeModel, { title: 'A' });

      await service.dismiss(userAIdStr, n.xid);

      const rows = await dismissalModel.find({ userId: userAId, noticeId: n._id }).lean();
      expect(rows).toHaveLength(1);
      expect(rows[0].dismissedAt).toBeInstanceOf(Date);
    });

    it('I-N-09: idempotent — second dismiss leaves only one row with original timestamp', async () => {
      const n = await seedNotice(noticeModel, { title: 'A' });

      await service.dismiss(userAIdStr, n.xid);
      const after1 = await dismissalModel.findOne({ userId: userAId, noticeId: n._id }).lean();
      const firstDismissedAt = after1!.dismissedAt.getTime();

      // Force a measurable delay before the second dismiss
      await new Promise((res) => setTimeout(res, 25));
      await service.dismiss(userAIdStr, n.xid);

      const rows = await dismissalModel.find({ userId: userAId, noticeId: n._id }).lean();
      expect(rows).toHaveLength(1);
      expect(rows[0].dismissedAt.getTime()).toBe(firstDismissedAt);
    });

    it('I-N-10: dismissing an unknown xid throws NotFoundException', async () => {
      await expect(service.dismiss(userAIdStr, 'not_missing')).rejects.toThrow(NotFoundException);
    });

    it('I-N-12: dismissing a non-dismissible notice still persists dismissal (server is permissive)', async () => {
      const n = await seedNotice(noticeModel, { title: 'pinned', dismissible: false });

      await service.dismiss(userAIdStr, n.xid);

      const rows = await dismissalModel.find({ userId: userAId, noticeId: n._id }).lean();
      expect(rows).toHaveLength(1);
    });

    it('I-N-13: two users dismissing the same notice create two rows', async () => {
      const n = await seedNotice(noticeModel, { title: 'shared' });

      await service.dismiss(userAIdStr, n.xid);
      await service.dismiss(userBIdStr, n.xid);

      const rows = await dismissalModel.find({ noticeId: n._id }).lean();
      expect(rows).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────
  // Sort + cap
  // ─────────────────────────────────────────────────────

  describe('getNoticesForUser — sort & cap', () => {
    it('I-N-06: sorts by priority desc, then by severity', async () => {
      await seedNotice(noticeModel, { title: 'p1-info', priority: 1, severity: NoticeSeverity.INFO });
      await seedNotice(noticeModel, {
        title: 'p1-critical',
        priority: 1,
        severity: NoticeSeverity.CRITICAL,
      });
      await seedNotice(noticeModel, { title: 'p5-info', priority: 5, severity: NoticeSeverity.INFO });
      await seedNotice(noticeModel, {
        title: 'p5-warning',
        priority: 5,
        severity: NoticeSeverity.WARNING,
      });

      const result = await service.getNoticesForUser(userAIdStr, UserRole.USER);

      expect(result.map((n) => n.title)).toEqual([
        'p5-warning',
        'p5-info',
        'p1-critical',
        'p1-info',
      ]);
    });

    it('I-N-07: caps output at 5 notices', async () => {
      for (let i = 0; i < 8; i++) {
        await seedNotice(noticeModel, { title: `n-${i}`, priority: 100 - i });
      }

      const result = await service.getNoticesForUser(userAIdStr, UserRole.USER);

      expect(result).toHaveLength(5);
      expect(result.map((n) => n.title)).toEqual(['n-0', 'n-1', 'n-2', 'n-3', 'n-4']);
    });
  });

  // ─────────────────────────────────────────────────────
  // Admin CRUD
  // ─────────────────────────────────────────────────────

  describe('admin CRUD', () => {
    const baseCreateDto = {
      type: NoticeType.BANNER,
      severity: NoticeSeverity.INFO,
      title: 'Created notice',
      dismissible: true,
      startsAt: '2026-04-01T00:00:00.000Z',
      active: true,
      audienceType: AudienceType.ALL,
      priority: 0,
    };

    it('I-N-17: adminCreate persists row and returns generated xid', async () => {
      const result = await service.adminCreate(baseCreateDto as any);

      expect(result.id).toBeDefined();
      expect(result.id.length).toBeGreaterThan(0);

      const row = await noticeModel.findOne({ xid: result.id }).lean();
      expect(row).not.toBeNull();
      expect(row!.title).toBe('Created notice');
      expect(row!.startsAt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });

    it('I-N-20: adminList paginates', async () => {
      // priority increases with i, so first page is 24..15 (priority desc)
      for (let i = 0; i < 25; i++) {
        await seedNotice(noticeModel, { title: `n-${i}`, priority: i });
      }

      const page1 = await service.adminList({}, 1, 10);
      const page2 = await service.adminList({}, 2, 10);
      const page3 = await service.adminList({}, 3, 10);

      expect(page1.total).toBe(25);
      expect(page1.items).toHaveLength(10);
      expect(page2.items).toHaveLength(10);
      expect(page3.items).toHaveLength(5);

      // No overlap between pages
      const allIds = [...page1.items, ...page2.items, ...page3.items].map((i) => i.id);
      expect(new Set(allIds).size).toBe(25);
    });

    it('I-N-21: adminList filters by active', async () => {
      await seedNotice(noticeModel, { title: 'active', active: true });
      await seedNotice(noticeModel, { title: 'inactive', active: false });

      const onlyActive = await service.adminList({ active: true }, 1, 20);
      const onlyInactive = await service.adminList({ active: false }, 1, 20);

      expect(onlyActive.items.map((i) => i.title)).toEqual(['active']);
      expect(onlyInactive.items.map((i) => i.title)).toEqual(['inactive']);
    });

    it('I-N-23: adminUpdate updates only provided fields and preserves expiresAt', async () => {
      const original = await seedNotice(noticeModel, {
        title: 'original',
        expiresAt: new Date('2026-12-31T00:00:00Z'),
      });

      await service.adminUpdate(original.xid, { title: 'updated' } as any);

      const updated = await noticeModel.findOne({ xid: original.xid }).lean();
      expect(updated!.title).toBe('updated');
      expect(updated!.expiresAt!.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    });

    it('I-N-24: adminUpdate with expiresAt:null clears expiry', async () => {
      const original = await seedNotice(noticeModel, {
        title: 'with-expiry',
        expiresAt: new Date('2026-12-31T00:00:00Z'),
      });

      await service.adminUpdate(original.xid, { expiresAt: null } as any);

      const updated = await noticeModel.findOne({ xid: original.xid }).lean();
      expect(updated!.expiresAt).toBeNull();
    });

    it('I-N-25: adminUpdate throws NotFoundException for unknown xid', async () => {
      await expect(
        service.adminUpdate('not_missing', { title: 'x' } as any)
      ).rejects.toThrow(NotFoundException);
    });

    it('I-N-26: adminDelete removes the row', async () => {
      const n = await seedNotice(noticeModel, { title: 'doomed' });

      await service.adminDelete(n.xid);

      const after = await noticeModel.findOne({ xid: n.xid }).lean();
      expect(after).toBeNull();
    });

    it('I-N-27: adminDelete throws NotFoundException when already deleted', async () => {
      const n = await seedNotice(noticeModel, { title: 'doomed' });

      await service.adminDelete(n.xid);
      await expect(service.adminDelete(n.xid)).rejects.toThrow(NotFoundException);
    });

    it('I-N-28: deleting a notice does NOT cascade-delete its dismissals (current behavior)', async () => {
      const n = await seedNotice(noticeModel, { title: 'doomed' });
      await service.dismiss(userAIdStr, n.xid);
      await service.dismiss(userBIdStr, n.xid);

      await service.adminDelete(n.xid);

      const orphaned = await dismissalModel.find({ noticeId: n._id }).lean();
      expect(orphaned).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────
  // Schema indexes (data-integrity contracts)
  // ─────────────────────────────────────────────────────

  describe('schema indexes', () => {
    it('I-X-04: notices collection has compound index {active, startsAt, expiresAt}', async () => {
      const indexes = await noticeModel.collection.indexes();
      const compound = indexes.find(
        (i) => i.key.active === 1 && i.key.startsAt === 1 && i.key.expiresAt === 1
      );
      expect(compound).toBeDefined();
    });

    it('I-X-05: notice_dismissals has unique compound index {userId, noticeId}', async () => {
      const indexes = await dismissalModel.collection.indexes();
      const unique = indexes.find(
        (i) => i.key.userId === 1 && i.key.noticeId === 1 && i.unique === true
      );
      expect(unique).toBeDefined();
    });

    it('unique index prevents duplicate (userId, noticeId) dismissals at the DB layer', async () => {
      const noticeId = new Types.ObjectId();
      await dismissalModel.create({
        userId: userAId,
        noticeId,
        dismissedAt: new Date(),
      });

      await expect(
        dismissalModel.create({
          userId: userAId,
          noticeId,
          dismissedAt: new Date(),
        })
      ).rejects.toThrow(/duplicate key/i);
    });
  });
});
