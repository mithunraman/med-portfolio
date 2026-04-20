import { ArtefactStatus, ReviewPeriodStatus, Specialty } from '@acme/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ok } from '../../common/utils/result.util';
import { ReviewPeriodsService } from '../review-periods.service';

// ── Helpers ──

const oid = () => new Types.ObjectId();
const userId = oid();
const userIdStr = userId.toString();

const futureDate = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
};

function makeReviewPeriodDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(),
    xid: 'rp_abc123',
    userId,
    name: 'ST2 Year 1 Review',
    startDate: futureDate(1),
    endDate: futureDate(365),
    status: ReviewPeriodStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeArtefactDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(),
    xid: 'art_abc123',
    artefactId: `${userIdStr}_client1`,
    userId,
    status: ArtefactStatus.COMPLETED,
    specialty: Specialty.GP,
    title: 'Test Entry',
    artefactType: null,
    reflection: null,
    capabilities: null,
    tags: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Mocks ──

const mockReviewPeriodsRepo = {
  create: jest.fn(),
  findByXid: jest.fn(),
  findByUserId: jest.fn(),
  findActiveByUserId: jest.fn(),
  updateByXid: jest.fn(),
};

const mockArtefactsRepo = {
  listArtefacts: jest.fn(),
  findByXid: jest.fn(),
  upsertArtefact: jest.fn(),
  updateArtefactById: jest.fn(),
  countByUser: jest.fn(),
};

const mockUserModel = {
  findById: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue({ specialty: 100, trainingStage: 'ST1' }),
  }),
};

const mockTransactionService = {
  withTransaction: jest.fn((fn: (session: any) => Promise<any>) => fn({} as any)),
};

function createService(): ReviewPeriodsService {
  return new ReviewPeriodsService(
    mockReviewPeriodsRepo as any,
    mockArtefactsRepo as any,
    mockUserModel as any,
    mockTransactionService as any,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ──

describe('ReviewPeriodsService', () => {
  let service: ReviewPeriodsService;

  beforeEach(() => {
    service = createService();
  });

  // ── createReviewPeriod ──

  describe('createReviewPeriod', () => {
    it('creates a review period with valid future dates', async () => {
      const doc = makeReviewPeriodDoc();
      mockReviewPeriodsRepo.findActiveByUserId.mockResolvedValue(ok(null));
      mockReviewPeriodsRepo.create.mockResolvedValue(ok(doc));

      const result = await service.createReviewPeriod(userIdStr, {
        name: 'ST2 Year 1 Review',
        startDate: futureDate(1).toISOString(),
        endDate: futureDate(365).toISOString(),
      });

      expect(result.id).toBe('rp_abc123');
      expect(result.name).toBe('ST2 Year 1 Review');
      expect(result.status).toBe(ReviewPeriodStatus.ACTIVE);
      expect(mockReviewPeriodsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: expect.any(Types.ObjectId),
          name: 'ST2 Year 1 Review',
        }),
        expect.anything()
      );
    });

    it('throws BadRequestException when endDate is before startDate', async () => {
      await expect(
        service.createReviewPeriod(userIdStr, {
          name: 'Test',
          startDate: futureDate(30).toISOString(),
          endDate: futureDate(1).toISOString(),
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('auto-archives the existing active period when creating a new one', async () => {
      const existingActive = makeReviewPeriodDoc({ xid: 'rp_old' });
      const newDoc = makeReviewPeriodDoc({ xid: 'rp_new', name: 'New Period' });
      mockReviewPeriodsRepo.findActiveByUserId.mockResolvedValue(ok(existingActive));
      mockReviewPeriodsRepo.updateByXid.mockResolvedValue(
        ok({ ...existingActive, status: ReviewPeriodStatus.ARCHIVED })
      );
      mockReviewPeriodsRepo.create.mockResolvedValue(ok(newDoc));

      const result = await service.createReviewPeriod(userIdStr, {
        name: 'New Period',
        startDate: futureDate(1).toISOString(),
        endDate: futureDate(365).toISOString(),
      });

      expect(result.id).toBe('rp_new');
      expect(mockReviewPeriodsRepo.updateByXid).toHaveBeenCalledWith(
        'rp_old',
        expect.any(Types.ObjectId),
        { status: ReviewPeriodStatus.ARCHIVED },
        expect.anything()
      );
    });
  });

  // ── getReviewPeriod ──

  describe('getReviewPeriod', () => {
    it('returns the review period DTO', async () => {
      const doc = makeReviewPeriodDoc();
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(doc));

      const result = await service.getReviewPeriod(userIdStr, 'rp_abc123');

      expect(result.id).toBe('rp_abc123');
      expect(result.name).toBe('ST2 Year 1 Review');
    });

    it('throws NotFoundException when not found', async () => {
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(null));

      await expect(service.getReviewPeriod(userIdStr, 'nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  // ── listReviewPeriods ──

  describe('listReviewPeriods', () => {
    it('returns all review periods for the user', async () => {
      const docs = [
        makeReviewPeriodDoc(),
        makeReviewPeriodDoc({ xid: 'rp_xyz', status: ReviewPeriodStatus.ARCHIVED }),
      ];
      mockReviewPeriodsRepo.findByUserId.mockResolvedValue(ok(docs));

      const result = await service.listReviewPeriods(userIdStr);

      expect(result.reviewPeriods).toHaveLength(2);
      expect(result.reviewPeriods[0].id).toBe('rp_abc123');
      expect(result.reviewPeriods[1].status).toBe(ReviewPeriodStatus.ARCHIVED);
    });
  });

  // ── updateReviewPeriod ──

  describe('updateReviewPeriod', () => {
    it('updates name and invalidates coverage cache', async () => {
      const existing = makeReviewPeriodDoc();
      const updated = makeReviewPeriodDoc({ name: 'Updated Name' });
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(existing));
      mockReviewPeriodsRepo.updateByXid.mockResolvedValue(ok(updated));

      const result = await service.updateReviewPeriod(userIdStr, 'rp_abc123', {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
    });

    it('throws BadRequestException when updating an archived period', async () => {
      const archived = makeReviewPeriodDoc({ status: ReviewPeriodStatus.ARCHIVED });
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(archived));

      await expect(
        service.updateReviewPeriod(userIdStr, 'rp_abc123', { name: 'New Name' })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when endDate would be before startDate', async () => {
      const existing = makeReviewPeriodDoc({
        startDate: futureDate(30),
        endDate: futureDate(365),
      });
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(existing));

      await expect(
        service.updateReviewPeriod(userIdStr, 'rp_abc123', {
          endDate: futureDate(1).toISOString(),
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── archiveReviewPeriod ──

  describe('archiveReviewPeriod', () => {
    it('archives the review period', async () => {
      const existing = makeReviewPeriodDoc();
      const archived = makeReviewPeriodDoc({ status: ReviewPeriodStatus.ARCHIVED });
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(existing));
      mockReviewPeriodsRepo.updateByXid.mockResolvedValue(ok(archived));

      const result = await service.archiveReviewPeriod(userIdStr, 'rp_abc123');

      expect(result.status).toBe(ReviewPeriodStatus.ARCHIVED);
      expect(mockReviewPeriodsRepo.updateByXid).toHaveBeenCalledWith(
        'rp_abc123',
        expect.any(Types.ObjectId),
        { status: ReviewPeriodStatus.ARCHIVED }
      );
    });

    it('throws BadRequestException when already archived', async () => {
      const archived = makeReviewPeriodDoc({ status: ReviewPeriodStatus.ARCHIVED });
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(archived));

      await expect(service.archiveReviewPeriod(userIdStr, 'rp_abc123')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  // ── getCoverage ──

  describe('getCoverage', () => {
    it('returns coverage with all 13 capabilities grouped by domain', async () => {
      const period = makeReviewPeriodDoc();
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [] }));

      const result = await service.getCoverage(userIdStr, 'rp_abc123');

      expect(result.summary.totalCapabilities).toBe(13);
      expect(result.summary.coveredCount).toBe(0);
      expect(result.summary.coveragePercent).toBe(0);
      expect(result.gaps).toHaveLength(13);
      expect(result.domains).toHaveLength(5);
    });

    it('counts capabilities from artefacts within the period date range', async () => {
      const startDate = futureDate(1);
      const endDate = futureDate(365);
      const withinPeriod = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

      const period = makeReviewPeriodDoc({ startDate, endDate });

      const artefactWithCaps = makeArtefactDoc({
        completedAt: withinPeriod,
        capabilities: [
          { code: 'C-01', evidence: 'Evidence for fitness to practise' },
          { code: 'C-04', evidence: 'Evidence for data gathering' },
        ],
      });

      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [artefactWithCaps] }));

      const result = await service.getCoverage(userIdStr, 'rp_abc123');

      expect(result.summary.coveredCount).toBe(2);
      expect(result.summary.coveragePercent).toBe(15); // 2/13 ≈ 15%
      expect(result.gaps).toHaveLength(11);
      expect(result.gaps).not.toContain('C-01');
      expect(result.gaps).not.toContain('C-04');
      expect(result.gaps).toContain('C-02');
    });

    it('excludes artefacts completed outside the period date range', async () => {
      const startDate = futureDate(30);
      const endDate = futureDate(365);
      const beforePeriod = futureDate(1);

      const period = makeReviewPeriodDoc({ startDate, endDate });

      const artefactOutsidePeriod = makeArtefactDoc({
        completedAt: beforePeriod,
        capabilities: [{ code: 'C-01', evidence: 'Evidence' }],
      });

      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [artefactOutsidePeriod] }));

      const result = await service.getCoverage(userIdStr, 'rp_abc123');

      expect(result.summary.coveredCount).toBe(0);
      expect(result.gaps).toHaveLength(13);
    });

    it('excludes artefacts without completedAt', async () => {
      const period = makeReviewPeriodDoc();
      const artefactNoCompletedAt = makeArtefactDoc({ completedAt: null });

      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [artefactNoCompletedAt] }));

      const result = await service.getCoverage(userIdStr, 'rp_abc123');

      expect(result.summary.coveredCount).toBe(0);
    });

    it('caches coverage and returns cached result on second call', async () => {
      const period = makeReviewPeriodDoc();
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [] }));

      await service.getCoverage(userIdStr, 'rp_abc123');
      await service.getCoverage(userIdStr, 'rp_abc123');

      // listArtefacts should only be called once — second call served from cache
      expect(mockArtefactsRepo.listArtefacts).toHaveBeenCalledTimes(1);
    });

    it('recomputes after cache invalidation via event', async () => {
      const period = makeReviewPeriodDoc();
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [] }));

      await service.getCoverage(userIdStr, 'rp_abc123');

      // Simulate artefact state change event
      service.handleArtefactStateChanged({ userId: userIdStr });

      await service.getCoverage(userIdStr, 'rp_abc123');

      // listArtefacts called twice — cache was invalidated
      expect(mockArtefactsRepo.listArtefacts).toHaveBeenCalledTimes(2);
    });

    it('counts multiple artefacts for the same capability', async () => {
      const startDate = futureDate(1);
      const endDate = futureDate(365);
      const withinPeriod = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

      const period = makeReviewPeriodDoc({ startDate, endDate });

      const artefact1 = makeArtefactDoc({
        completedAt: withinPeriod,
        capabilities: [{ code: 'C-01', evidence: 'Evidence 1' }],
      });
      const artefact2 = makeArtefactDoc({
        completedAt: withinPeriod,
        capabilities: [{ code: 'C-01', evidence: 'Evidence 2' }],
      });

      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [artefact1, artefact2] }));

      const result = await service.getCoverage(userIdStr, 'rp_abc123');

      const c01 = result.domains.flatMap((d) => d.capabilities).find((c) => c.code === 'C-01');
      expect(c01?.entryCount).toBe(2);
      expect(c01?.status).toBe('covered');
      expect(result.summary.coveredCount).toBe(1); // only 1 unique capability covered
    });
  });

  // ── getActiveCoverageSummary ──

  describe('getActiveCoverageSummary', () => {
    it('returns null when no active review period exists', async () => {
      mockReviewPeriodsRepo.findActiveByUserId.mockResolvedValue(ok(null));

      const result = await service.getActiveCoverageSummary(userIdStr);

      expect(result).toBeNull();
    });

    it('returns period and summary when active period exists', async () => {
      const period = makeReviewPeriodDoc();
      mockReviewPeriodsRepo.findActiveByUserId.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [] }));

      const result = await service.getActiveCoverageSummary(userIdStr);

      expect(result).not.toBeNull();
      expect(result!.period.id).toBe('rp_abc123');
      expect(result!.coverage.totalCapabilities).toBe(13);
      expect(result!.coverage.coveredCount).toBe(0);
    });
  });

  // ── handleArtefactStateChanged ──

  describe('handleArtefactStateChanged', () => {
    it('invalidates cache for the given userId', async () => {
      const period = makeReviewPeriodDoc();
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [] }));

      // Prime the cache
      await service.getCoverage(userIdStr, 'rp_abc123');
      expect(mockArtefactsRepo.listArtefacts).toHaveBeenCalledTimes(1);

      // Invalidate via event
      service.handleArtefactStateChanged({ userId: userIdStr });

      // Next call recomputes
      await service.getCoverage(userIdStr, 'rp_abc123');
      expect(mockArtefactsRepo.listArtefacts).toHaveBeenCalledTimes(2);
    });

    it('does not invalidate cache for other users', async () => {
      const period = makeReviewPeriodDoc();
      mockReviewPeriodsRepo.findByXid.mockResolvedValue(ok(period));
      mockArtefactsRepo.listArtefacts.mockResolvedValue(ok({ artefacts: [] }));

      // Prime the cache
      await service.getCoverage(userIdStr, 'rp_abc123');

      // Invalidate for a different user
      service.handleArtefactStateChanged({ userId: oid().toString() });

      // Cache still valid for original user
      await service.getCoverage(userIdStr, 'rp_abc123');
      expect(mockArtefactsRepo.listArtefacts).toHaveBeenCalledTimes(1);
    });
  });
});
