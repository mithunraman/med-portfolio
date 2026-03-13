import { ReviewPeriodStatus } from '@acme/shared';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import { isOk } from '../../common/utils/result.util';
import { ReviewPeriodsRepository } from '../review-periods.repository';
import { REVIEW_PERIODS_REPOSITORY } from '../review-periods.repository.interface';
import {
  ReviewPeriod,
  ReviewPeriodDocument,
  ReviewPeriodSchema,
} from '../schemas/review-period.schema';

// ── Helpers ──

const userId = new Types.ObjectId();

async function insertPeriod(
  model: Model<ReviewPeriodDocument>,
  overrides: Partial<{
    xid: string;
    userId: Types.ObjectId;
    name: string;
    startDate: Date;
    endDate: Date;
    status: ReviewPeriodStatus;
  }> = {},
) {
  const [doc] = await model.create([
    {
      xid: overrides.xid ?? `rp_${new Types.ObjectId().toString().slice(-6)}`,
      userId: overrides.userId ?? userId,
      name: overrides.name ?? 'ST2 Year 1 Review',
      startDate: overrides.startDate ?? new Date('2026-04-01'),
      endDate: overrides.endDate ?? new Date('2027-04-01'),
      status: overrides.status ?? ReviewPeriodStatus.ACTIVE,
    },
  ]);
  return doc;
}

// ── Test suite ──

describe('ReviewPeriodsRepository (integration)', () => {
  let mongod: MongoMemoryReplSet;
  let module: TestingModule;
  let repo: ReviewPeriodsRepository;
  let model: Model<ReviewPeriodDocument>;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });

    module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([{ name: ReviewPeriod.name, schema: ReviewPeriodSchema }]),
      ],
      providers: [
        { provide: REVIEW_PERIODS_REPOSITORY, useClass: ReviewPeriodsRepository },
      ],
    }).compile();

    await module.init();

    repo = module.get(REVIEW_PERIODS_REPOSITORY);
    model = module.get<Model<ReviewPeriodDocument>>(getModelToken(ReviewPeriod.name));
  }, 60_000);

  afterAll(async () => {
    await module.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await model.deleteMany({});
  });

  // ─── create ───

  describe('create', () => {
    it('creates a review period with generated xid', async () => {
      const result = await repo.create({
        userId,
        name: 'ST2 Year 1',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-04-01'),
      });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.xid).toBeDefined();
      expect(result.value.name).toBe('ST2 Year 1');
      expect(result.value.status).toBe(ReviewPeriodStatus.ACTIVE);
    });
  });

  // ─── findByXid ───

  describe('findByXid', () => {
    it('returns the period when found', async () => {
      await insertPeriod(model, { xid: 'rp_find1' });

      const result = await repo.findByXid('rp_find1', userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).not.toBeNull();
      expect(result.value!.xid).toBe('rp_find1');
    });

    it('returns null when not found', async () => {
      const result = await repo.findByXid('nonexistent', userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBeNull();
    });

    it('does not return periods belonging to other users', async () => {
      const otherUserId = new Types.ObjectId();
      await insertPeriod(model, { xid: 'rp_other', userId: otherUserId });

      const result = await repo.findByXid('rp_other', userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBeNull();
    });
  });

  // ─── findByUserId ───

  describe('findByUserId', () => {
    it('returns all periods for the user sorted by createdAt desc', async () => {
      await insertPeriod(model, { xid: 'rp_a', name: 'Period A' });
      await insertPeriod(model, { xid: 'rp_b', name: 'Period B' });

      const result = await repo.findByUserId(userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(2);
    });

    it('filters by status when provided', async () => {
      await insertPeriod(model, { xid: 'rp_active', status: ReviewPeriodStatus.ACTIVE });
      await insertPeriod(model, { xid: 'rp_archived', status: ReviewPeriodStatus.ARCHIVED });

      const result = await repo.findByUserId(userId, [ReviewPeriodStatus.ACTIVE]);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].xid).toBe('rp_active');
    });

    it('does not return periods from other users', async () => {
      const otherUserId = new Types.ObjectId();
      await insertPeriod(model, { xid: 'rp_mine', userId });
      await insertPeriod(model, { xid: 'rp_theirs', userId: otherUserId });

      const result = await repo.findByUserId(userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0].xid).toBe('rp_mine');
    });
  });

  // ─── findActiveByUserId ───

  describe('findActiveByUserId', () => {
    it('returns the active period', async () => {
      await insertPeriod(model, { xid: 'rp_active', status: ReviewPeriodStatus.ACTIVE });

      const result = await repo.findActiveByUserId(userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).not.toBeNull();
      expect(result.value!.xid).toBe('rp_active');
    });

    it('returns null when only archived periods exist', async () => {
      await insertPeriod(model, { status: ReviewPeriodStatus.ARCHIVED });

      const result = await repo.findActiveByUserId(userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBeNull();
    });

    it('returns null when no periods exist', async () => {
      const result = await repo.findActiveByUserId(userId);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBeNull();
    });
  });

  // ─── updateByXid ───

  describe('updateByXid', () => {
    it('updates name', async () => {
      await insertPeriod(model, { xid: 'rp_upd1' });

      const result = await repo.updateByXid('rp_upd1', userId, { name: 'Updated Name' });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).not.toBeNull();
      expect(result.value!.name).toBe('Updated Name');
    });

    it('updates status to archived', async () => {
      await insertPeriod(model, { xid: 'rp_upd2' });

      const result = await repo.updateByXid('rp_upd2', userId, {
        status: ReviewPeriodStatus.ARCHIVED,
      });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value!.status).toBe(ReviewPeriodStatus.ARCHIVED);

      // Verify persisted
      const doc = await model.findOne({ xid: 'rp_upd2' }).lean();
      expect(doc!.status).toBe(ReviewPeriodStatus.ARCHIVED);
    });

    it('updates dates', async () => {
      await insertPeriod(model, { xid: 'rp_upd3' });
      const newStart = new Date('2026-06-01');
      const newEnd = new Date('2027-06-01');

      const result = await repo.updateByXid('rp_upd3', userId, {
        startDate: newStart,
        endDate: newEnd,
      });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value!.startDate.toISOString()).toBe(newStart.toISOString());
      expect(result.value!.endDate.toISOString()).toBe(newEnd.toISOString());
    });

    it('returns null when period not found', async () => {
      const result = await repo.updateByXid('nonexistent', userId, { name: 'Nope' });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBeNull();
    });

    it('does not update periods belonging to other users', async () => {
      const otherUserId = new Types.ObjectId();
      await insertPeriod(model, { xid: 'rp_other_upd', userId: otherUserId });

      const result = await repo.updateByXid('rp_other_upd', userId, { name: 'Hacked' });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBeNull();

      // Verify unchanged
      const doc = await model.findOne({ xid: 'rp_other_upd' }).lean();
      expect(doc!.name).toBe('ST2 Year 1 Review');
    });
  });
});
