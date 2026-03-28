import { Types } from 'mongoose';
import type { OutboxEntry } from '../schemas/outbox.schema';
import { OutboxService } from '../outbox.service';
import { OutboxConsumer, type OutboxHandler } from '../outbox.consumer';
import { MetricsService } from '../../common/metrics';

// ── Helpers ──

function createDeferred(): { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void } {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeEntry(type: string, id?: Types.ObjectId): OutboxEntry {
  return {
    _id: id ?? new Types.ObjectId(),
    type,
    payload: {},
    status: 200, // PROCESSING (already claimed)
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    processAfter: new Date(),
    lockedUntil: new Date(Date.now() + 600_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as OutboxEntry;
}

function createConsumer(overrides: {
  claimBatch?: jest.Mock;
  resetStaleLocks?: jest.Mock;
  markCompleted?: jest.Mock;
  markFailed?: jest.Mock;
  handlers?: OutboxHandler[];
} = {}) {
  const outboxService = {
    claimBatch: overrides.claimBatch ?? jest.fn().mockResolvedValue([]),
    resetStaleLocks: overrides.resetStaleLocks ?? jest.fn().mockResolvedValue(0),
    markCompleted: overrides.markCompleted ?? jest.fn().mockResolvedValue(undefined),
    markFailed: overrides.markFailed ?? jest.fn().mockResolvedValue(undefined),
    countPending: jest.fn().mockResolvedValue(0),
  } as unknown as OutboxService;

  const metricsService = {
    recordOutboxJobStart: jest.fn(),
    recordOutboxJobEnd: jest.fn(),
    recordOutboxJobFailure: jest.fn(),
    recordOutboxQueueDepth: jest.fn(),
  } as unknown as MetricsService;

  const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  } as unknown as import('nestjs-pino').PinoLogger;

  const consumer = new OutboxConsumer(logger, outboxService, metricsService, overrides.handlers ?? []);

  return { consumer, outboxService };
}

// Access private poll() for deterministic testing
function poll(consumer: OutboxConsumer): Promise<void> {
  return (consumer as unknown as { poll(): Promise<void> }).poll();
}

function getActiveJobs(consumer: OutboxConsumer): number {
  return (consumer as unknown as { activeJobs: number }).activeJobs;
}

// ── Tests ──

describe('OutboxConsumer (semaphore concurrency)', () => {
  it('should claim up to MAX_CONCURRENCY jobs when idle', async () => {
    const claimBatch = jest.fn().mockResolvedValue([]);
    const { consumer } = createConsumer({ claimBatch });

    await poll(consumer);

    // MAX_CONCURRENCY is 5, activeJobs is 0, so freeSlots = 5
    expect(claimBatch).toHaveBeenCalledWith(5);
  });

  it('should skip polling when all slots are occupied', async () => {
    const slowJob = createDeferred();
    const handler: OutboxHandler = { type: 'slow', handle: () => slowJob.promise };

    const claimBatch = jest.fn()
      .mockResolvedValueOnce([
        makeEntry('slow'),
        makeEntry('slow'),
        makeEntry('slow'),
        makeEntry('slow'),
        makeEntry('slow'),
      ])
      .mockResolvedValue([]);

    const { consumer } = createConsumer({ claimBatch, handlers: [handler] });

    // First poll: claims 5 jobs, all blocked on slowJob.promise
    await poll(consumer);
    expect(getActiveJobs(consumer)).toBe(5);

    // Second poll: all slots occupied → should not call claimBatch again
    claimBatch.mockClear();
    await poll(consumer);
    expect(claimBatch).not.toHaveBeenCalled();

    // Cleanup: resolve all slow jobs
    slowJob.resolve();
    // Allow microtasks (.finally callbacks) to run
    await Promise.resolve();
  });

  it('should claim new jobs when slots free up — no head-of-line blocking', async () => {
    const slowJob = createDeferred();
    const fastJob = createDeferred();

    const handlers: OutboxHandler[] = [
      { type: 'slow', handle: () => slowJob.promise },
      { type: 'fast', handle: () => fastJob.promise },
    ];

    const waitingEntry = makeEntry('fast');
    const claimBatch = jest.fn()
      .mockResolvedValueOnce([makeEntry('slow'), makeEntry('fast')]) // poll 1: 2 jobs
      .mockResolvedValueOnce([waitingEntry])                         // poll 2: 1 more job
      .mockResolvedValue([]);

    const markCompleted = jest.fn().mockResolvedValue(undefined);
    const { consumer } = createConsumer({ claimBatch, markCompleted, handlers });

    // Poll 1: claims slow + fast. activeJobs = 2
    await poll(consumer);
    expect(getActiveJobs(consumer)).toBe(2);

    // Fast job completes. activeJobs drops to 1.
    fastJob.resolve();
    // Flush: handler promise → markCompleted → .finally() counter decrement
    await new Promise((r) => setImmediate(r));

    expect(getActiveJobs(consumer)).toBe(1);

    // Poll 2: slow job still running, but 4 free slots. Claims waiting job.
    await poll(consumer);
    // claimBatch should be called with freeSlots = 4
    expect(claimBatch).toHaveBeenLastCalledWith(4);
    expect(getActiveJobs(consumer)).toBe(2); // slow + waiting

    // Cleanup
    slowJob.resolve();
    await Promise.resolve();
  });

  it('should free slot and call markFailed when a handler throws', async () => {
    const failingJob = createDeferred();
    const handler: OutboxHandler = { type: 'fail', handle: () => failingJob.promise };

    const entry = makeEntry('fail');
    const claimBatch = jest.fn().mockResolvedValueOnce([entry]).mockResolvedValue([]);
    const markFailed = jest.fn().mockResolvedValue(undefined);
    const { consumer } = createConsumer({ claimBatch, markFailed, handlers: [handler] });

    // Poll: claims 1 job
    await poll(consumer);
    expect(getActiveJobs(consumer)).toBe(1);

    // Job fails
    failingJob.reject(new Error('Transcription timeout'));
    // Flush: .finally() for counter + catch in processEntry for markFailed
    await new Promise((r) => setImmediate(r));

    expect(getActiveJobs(consumer)).toBe(0);
    expect(markFailed).toHaveBeenCalledWith(entry._id, 'Transcription timeout');
  });

  it('should handle sequential polls correctly when claiming is slow', async () => {
    const claimDeferred = createDeferred();
    // resetStaleLocks blocks until we resolve — simulates slow DB
    const resetStaleLocks = jest.fn().mockReturnValue(claimDeferred.promise);
    const claimBatch = jest.fn().mockResolvedValue([]);
    const { consumer } = createConsumer({ claimBatch, resetStaleLocks });

    // Poll A: enters, hits resetStaleLocks which blocks
    const pollA = poll(consumer);

    // resetStaleLocks called once (from poll A)
    expect(resetStaleLocks).toHaveBeenCalledTimes(1);

    // Unblock poll A
    claimDeferred.resolve();
    await pollA;

    // Poll B: should work normally after A completes
    resetStaleLocks.mockResolvedValue(0);
    await poll(consumer);
    expect(resetStaleLocks).toHaveBeenCalledTimes(2);
  });

  it('should not corrupt counter when queue is empty', async () => {
    const claimBatch = jest.fn().mockResolvedValue([]);
    const { consumer } = createConsumer({ claimBatch });

    await poll(consumer);
    expect(getActiveJobs(consumer)).toBe(0);

    await poll(consumer);
    expect(getActiveJobs(consumer)).toBe(0);
  });
});
