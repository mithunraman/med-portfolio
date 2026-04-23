import { AudienceType, NoticeSeverity, NoticeType } from '@acme/shared';
import { Types } from 'mongoose';
import { isErr, isOk } from '../../common/utils/result.util';
import { NoticesRepository } from '../notices.repository';

// ── Helpers ──

function leanResolve<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

function leanReject(error: unknown) {
  return { lean: jest.fn().mockRejectedValue(error) };
}

function chainable(value: unknown) {
  // Mongoose Query supports .sort().skip().limit().lean()
  const chain: any = {};
  chain.sort = jest.fn().mockReturnValue(chain);
  chain.skip = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockResolvedValue(value);
  return chain;
}

function createNoticeModel() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn(),
  };
}

function createDismissalModel() {
  return {
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
}

const userId = new Types.ObjectId();
const noticeId = new Types.ObjectId();

// ── Tests ──

describe('NoticesRepository', () => {
  let noticeModel: ReturnType<typeof createNoticeModel>;
  let dismissalModel: ReturnType<typeof createDismissalModel>;
  let repo: NoticesRepository;

  beforeEach(() => {
    noticeModel = createNoticeModel();
    dismissalModel = createDismissalModel();
    repo = new NoticesRepository(noticeModel as any, dismissalModel as any);
  });

  describe('findActive', () => {
    it('U-R-04: builds the active-window query with $or on expiresAt', async () => {
      const now = new Date('2026-04-23T10:00:00Z');
      noticeModel.find.mockReturnValue(leanResolve([]));

      await repo.findActive(now);

      expect(noticeModel.find).toHaveBeenCalledTimes(1);
      const [filter] = noticeModel.find.mock.calls[0];
      expect(filter).toEqual({
        active: true,
        startsAt: { $lte: now },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      });
    });

    it('returns err on throw', async () => {
      noticeModel.find.mockReturnValue(leanReject(new Error('boom')));

      const result = await repo.findActive(new Date());

      expect(isErr(result)).toBe(true);
    });
  });

  describe('findAll', () => {
    it('U-R-05: applies sort {priority:-1, createdAt:-1}, skip and limit', async () => {
      const chain = chainable([]);
      noticeModel.find.mockReturnValue(chain);
      noticeModel.countDocuments.mockResolvedValue(0);

      await repo.findAll({}, 10, 25);

      expect(chain.sort).toHaveBeenCalledWith({ priority: -1, createdAt: -1 });
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(25);
    });

    it('passes active filter through when provided', async () => {
      const chain = chainable([]);
      noticeModel.find.mockReturnValue(chain);
      noticeModel.countDocuments.mockResolvedValue(0);

      await repo.findAll({ active: true }, 0, 20);

      expect(noticeModel.find).toHaveBeenCalledWith({ active: true });
      expect(noticeModel.countDocuments).toHaveBeenCalledWith({ active: true });
    });

    it('omits active filter when undefined', async () => {
      const chain = chainable([]);
      noticeModel.find.mockReturnValue(chain);
      noticeModel.countDocuments.mockResolvedValue(0);

      await repo.findAll({}, 0, 20);

      expect(noticeModel.find).toHaveBeenCalledWith({});
    });

    it('U-R-06: runs docs query and countDocuments in parallel', async () => {
      let docsResolve!: (v: unknown) => void;
      let countResolve!: (v: unknown) => void;
      const docsPromise = new Promise((res) => (docsResolve = res));
      const countPromise = new Promise((res) => (countResolve = res));

      const chain: any = {};
      chain.sort = jest.fn().mockReturnValue(chain);
      chain.skip = jest.fn().mockReturnValue(chain);
      chain.limit = jest.fn().mockReturnValue(chain);
      chain.lean = jest.fn().mockReturnValue(docsPromise);
      noticeModel.find.mockReturnValue(chain);
      noticeModel.countDocuments.mockReturnValue(countPromise);

      const resultPromise = repo.findAll({}, 0, 20);

      // Both should already have been invoked before either resolves
      expect(noticeModel.find).toHaveBeenCalledTimes(1);
      expect(noticeModel.countDocuments).toHaveBeenCalledTimes(1);

      docsResolve([]);
      countResolve(7);

      const result = await resultPromise;
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value.total).toBe(7);
    });
  });

  describe('findByXid', () => {
    it('returns ok(doc) on hit', async () => {
      noticeModel.findOne.mockReturnValue(leanResolve({ xid: 'not_a' }));

      const result = await repo.findByXid('not_a');

      expect(noticeModel.findOne).toHaveBeenCalledWith({ xid: 'not_a' });
      expect(isOk(result)).toBe(true);
    });

    it('returns ok(null) on miss', async () => {
      noticeModel.findOne.mockReturnValue(leanResolve(null));

      const result = await repo.findByXid('not_missing');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBeNull();
    });

    it('returns err on throw', async () => {
      noticeModel.findOne.mockReturnValue(leanReject(new Error('boom')));

      const result = await repo.findByXid('not_x');

      expect(isErr(result)).toBe(true);
    });
  });

  describe('create', () => {
    it('returns ok(doc) on success', async () => {
      const data = {
        type: NoticeType.BANNER,
        severity: NoticeSeverity.INFO,
        title: 'T',
        dismissible: true,
        startsAt: new Date(),
        active: true,
        audienceType: AudienceType.ALL,
        priority: 0,
      };
      noticeModel.create.mockResolvedValue({ toObject: () => ({ xid: 'not_new', ...data }) });

      const result = await repo.create(data);

      expect(noticeModel.create).toHaveBeenCalledWith(data);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toMatchObject({ xid: 'not_new' });
    });

    it('returns err on throw', async () => {
      noticeModel.create.mockRejectedValue(new Error('boom'));

      const result = await repo.create({} as any);

      expect(isErr(result)).toBe(true);
    });
  });

  describe('update', () => {
    it('returns ok(doc) on hit with $set, new:true', async () => {
      noticeModel.findOneAndUpdate.mockReturnValue(leanResolve({ xid: 'not_x' }));

      const data = { title: 'New' };
      const result = await repo.update('not_x', data);

      expect(noticeModel.findOneAndUpdate).toHaveBeenCalledWith(
        { xid: 'not_x' },
        { $set: data },
        { new: true }
      );
      expect(isOk(result)).toBe(true);
    });

    it('returns ok(null) on miss', async () => {
      noticeModel.findOneAndUpdate.mockReturnValue(leanResolve(null));

      const result = await repo.update('not_missing', {});

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBeNull();
    });
  });

  describe('delete', () => {
    it('returns ok(true) when deletedCount > 0', async () => {
      noticeModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await repo.delete('not_x');

      expect(noticeModel.deleteOne).toHaveBeenCalledWith({ xid: 'not_x' });
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(true);
    });

    it('returns ok(false) when deletedCount is 0', async () => {
      noticeModel.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await repo.delete('not_missing');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value).toBe(false);
    });
  });

  describe('findDismissals', () => {
    it('queries with userId and $in on noticeIds', async () => {
      dismissalModel.find.mockReturnValue(leanResolve([]));
      const ids = [new Types.ObjectId(), new Types.ObjectId()];

      await repo.findDismissals(userId, ids);

      expect(dismissalModel.find).toHaveBeenCalledWith({ userId, noticeId: { $in: ids } });
    });
  });

  describe('upsertDismissal', () => {
    it('U-R-07: uses $setOnInsert (not $set) — preserves original dismissedAt', async () => {
      dismissalModel.findOneAndUpdate.mockReturnValue(leanResolve({ userId, noticeId }));

      await repo.upsertDismissal(userId, noticeId);

      expect(dismissalModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter, update, options] = dismissalModel.findOneAndUpdate.mock.calls[0];

      expect(filter).toEqual({ userId, noticeId });
      expect(update.$setOnInsert).toBeDefined();
      expect(update.$setOnInsert.userId).toBe(userId);
      expect(update.$setOnInsert.noticeId).toBe(noticeId);
      expect(update.$setOnInsert.dismissedAt).toBeInstanceOf(Date);
      expect(update.$set).toBeUndefined();
      expect(options).toEqual({ upsert: true, new: true });
    });
  });
});
