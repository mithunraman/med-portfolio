import { OutboxStatus } from '@acme/shared';
import { Types } from 'mongoose';
import { TransactionService } from '../../database/transaction.service';
import { OutboxRepository } from '../outbox.repository';

// ── Helpers ──

const oid = () => new Types.ObjectId();

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    _id: oid(),
    type: 'analysis.start',
    payload: {},
    status: OutboxStatus.PROCESSING,
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    processAfter: new Date(),
    lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
    ...overrides,
  };
}

function createRepository(overrides: {
  findById?: jest.Mock;
  updateOne?: jest.Mock;
  withTransaction?: jest.Mock;
} = {}) {
  const findByIdQuery = {
    session: jest.fn().mockReturnThis(),
    lean: jest.fn(),
  };

  const findById = overrides.findById ?? jest.fn().mockReturnValue(findByIdQuery);

  const model = {
    findById,
    updateOne: overrides.updateOne ?? jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  } as any;

  const transactionService = {
    withTransaction: overrides.withTransaction ?? jest.fn((fn) => fn({})),
  } as unknown as TransactionService;

  const repository = new OutboxRepository(model, transactionService);

  return { repository, model, transactionService, findByIdQuery };
}

// ── Tests ──

describe('OutboxRepository – markFailed', () => {
  it('should increment attempts and reschedule with backoff when under maxAttempts', async () => {
    const entry = makeEntry({ attempts: 0, maxAttempts: 3 });
    const updatedEntry = { ...entry, attempts: 1, status: OutboxStatus.PENDING };

    const findByIdQuery = {
      session: jest.fn().mockReturnThis(),
      lean: jest.fn()
        .mockResolvedValueOnce(entry)        // first read
        .mockResolvedValueOnce(updatedEntry), // read after update
    };
    const findById = jest.fn().mockReturnValue(findByIdQuery);
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const { repository } = createRepository({ findById, updateOne });
    const result = await repository.markFailed(entry._id, 'some error');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.attempts).toBe(1);
      expect(result.value?.status).toBe(OutboxStatus.PENDING);
    }

    // Verify updateOne was called with correct values
    const updateCall = updateOne.mock.calls[0];
    expect(updateCall[0]).toEqual({ _id: entry._id });
    expect(updateCall[1].$set.attempts).toBe(1);
    expect(updateCall[1].$set.status).toBe(OutboxStatus.PENDING);
    expect(updateCall[1].$set.lockedUntil).toBeNull();
    expect(updateCall[1].$set.processAfter).toBeInstanceOf(Date);
    expect(updateCall[1].$set.lastError).toBe('some error');
  });

  it('should transition to FAILED when attempts reaches maxAttempts', async () => {
    const entry = makeEntry({ attempts: 2, maxAttempts: 3 });
    const updatedEntry = { ...entry, attempts: 3, status: OutboxStatus.FAILED };

    const findByIdQuery = {
      session: jest.fn().mockReturnThis(),
      lean: jest.fn()
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce(updatedEntry),
    };
    const findById = jest.fn().mockReturnValue(findByIdQuery);
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const { repository } = createRepository({ findById, updateOne });
    const result = await repository.markFailed(entry._id, 'final error');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.attempts).toBe(3);
      expect(result.value?.status).toBe(OutboxStatus.FAILED);
    }

    const updateCall = updateOne.mock.calls[0];
    expect(updateCall[1].$set.status).toBe(OutboxStatus.FAILED);
  });

  it('should use exponential backoff for processAfter', async () => {
    const entry = makeEntry({ attempts: 1, maxAttempts: 3 });

    const findByIdQuery = {
      session: jest.fn().mockReturnThis(),
      lean: jest.fn()
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce(entry),
    };
    const findById = jest.fn().mockReturnValue(findByIdQuery);
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const now = Date.now();
    const { repository } = createRepository({ findById, updateOne });
    await repository.markFailed(entry._id, 'retry error');

    const updateCall = updateOne.mock.calls[0];
    const processAfter = updateCall[1].$set.processAfter as Date;
    // attempts goes from 1 → 2, so backoff = 2^2 * 1000 = 4000ms
    expect(processAfter.getTime()).toBeGreaterThanOrEqual(now + 4000 - 100);
    expect(processAfter.getTime()).toBeLessThanOrEqual(now + 4000 + 1000);
  });

  it('should return ok(null) when entry is not in PROCESSING status', async () => {
    const entry = makeEntry({ status: OutboxStatus.PENDING });

    const findByIdQuery = {
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(entry),
    };
    const findById = jest.fn().mockReturnValue(findByIdQuery);

    const { repository } = createRepository({ findById });
    const result = await repository.markFailed(entry._id, 'some error');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('should return ok(null) when entry does not exist', async () => {
    const findByIdQuery = {
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null),
    };
    const findById = jest.fn().mockReturnValue(findByIdQuery);

    const { repository } = createRepository({ findById });
    const result = await repository.markFailed(oid(), 'some error');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('should execute read and write within a transaction', async () => {
    const entry = makeEntry();
    const findByIdQuery = {
      session: jest.fn().mockReturnThis(),
      lean: jest.fn()
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce({ ...entry, attempts: 1 }),
    };
    const findById = jest.fn().mockReturnValue(findByIdQuery);
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const withTransaction = jest.fn((fn) => fn({ mockSession: true }));

    const { repository } = createRepository({ findById, updateOne, withTransaction });
    await repository.markFailed(entry._id, 'error');

    // Transaction was used
    expect(withTransaction).toHaveBeenCalledTimes(1);

    // Session was passed to findById and updateOne
    expect(findByIdQuery.session).toHaveBeenCalledWith({ mockSession: true });
    expect(updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ session: { mockSession: true } }),
    );
  });
});
