import { MediaStatus, MediaType } from '@acme/shared';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
import { StorageService } from '../../storage/storage.service';
import { MediaSweeperService } from '../media-sweeper.service';
import { IMediaRepository } from '../media.repository.interface';
import { Media } from '../schemas/media.schema';

const BATCH_SIZE = 10;
const MAX_BATCHES_PER_RUN = 500;

function buildMedia(overrides: Partial<Media> = {}): Media {
  return {
    _id: new Types.ObjectId(),
    xid: 'med_x',
    userId: new Types.ObjectId(),
    bucket: 'b',
    key: 'media/u/x.m4a',
    status: MediaStatus.PENDING_DELETE,
    refCollection: null,
    refDocumentId: null,
    mediaType: MediaType.AUDIO,
    mimeType: 'audio/mp4',
    sizeBytes: null,
    durationMs: null,
    pendingDeleteAt: new Date(),
    deleteAttempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Media;
}

function createMockRepo(): jest.Mocked<IMediaRepository> {
  return {
    create: jest.fn(),
    findByXid: jest.fn(),
    updateStatus: jest.fn(),
    findByUser: jest.fn(),
    markPendingDeleteByMessageIds: jest.fn(),
    markPendingDeleteByUser: jest.fn(),
    expireAudioOlderThan: jest.fn().mockResolvedValue(ok(0)),
    findPendingDeleteBatch: jest.fn().mockResolvedValue(ok([])),
    countDeadLettered: jest.fn().mockResolvedValue(ok(0)),
    markDeleted: jest.fn().mockResolvedValue(ok(0)),
    incrementDeleteAttempts: jest.fn().mockResolvedValue(ok(undefined)),
  } as unknown as jest.Mocked<IMediaRepository>;
}

function createMockStorage(): jest.Mocked<Pick<StorageService, 'deleteObject'>> {
  return {
    deleteObject: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function createService(
  repo = createMockRepo(),
  storage = createMockStorage()
) {
  const service = new MediaSweeperService(repo, storage as unknown as StorageService);
  return { service, repo, storage };
}

describe('MediaSweeperService.sweep', () => {
  beforeEach(() => jest.resetAllMocks());

  it('happy path: deletes each S3 object and marks all ids deleted in one call', async () => {
    const batch = [buildMedia(), buildMedia(), buildMedia()];
    const repo = createMockRepo();
    repo.findPendingDeleteBatch
      .mockResolvedValueOnce(ok(batch))
      .mockResolvedValueOnce(ok([]));
    const { service, storage } = createService(repo);

    const stats = await service.sweep();

    expect(stats).toEqual({ batches: 1, attempted: 3, succeeded: 3, failed: 0 });
    expect(storage.deleteObject).toHaveBeenCalledTimes(3);
    expect(repo.markDeleted).toHaveBeenCalledTimes(1);
    expect(repo.markDeleted).toHaveBeenCalledWith(batch.map((m) => m._id.toString()));
    expect(repo.incrementDeleteAttempts).not.toHaveBeenCalled();
  });

  it('mid-batch S3 failure: increments attempts for the failed id and marks the rest', async () => {
    const batch = [buildMedia(), buildMedia(), buildMedia()];
    const repo = createMockRepo();
    repo.findPendingDeleteBatch.mockResolvedValueOnce(ok(batch));
    const storage = createMockStorage();
    storage.deleteObject
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('S3 timeout'))
      .mockResolvedValueOnce(undefined);

    const { service } = createService(repo, storage);
    const stats = await service.sweep();

    expect(stats).toEqual({ batches: 1, attempted: 3, succeeded: 2, failed: 1 });
    expect(repo.incrementDeleteAttempts).toHaveBeenCalledTimes(1);
    expect(repo.incrementDeleteAttempts).toHaveBeenCalledWith(batch[1]._id.toString());
    expect(repo.markDeleted).toHaveBeenCalledWith([
      batch[0]._id.toString(),
      batch[2]._id.toString(),
    ]);
  });

  it('empty batch: returns immediately with zero stats and no calls', async () => {
    const repo = createMockRepo();
    repo.findPendingDeleteBatch.mockResolvedValueOnce(ok([]));
    const { service, storage } = createService(repo);

    const stats = await service.sweep();

    expect(stats).toEqual({ batches: 0, attempted: 0, succeeded: 0, failed: 0 });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(repo.markDeleted).not.toHaveBeenCalled();
  });

  it('findPendingDeleteBatch error: logs and bails out without S3 calls', async () => {
    const repo = createMockRepo();
    repo.findPendingDeleteBatch.mockResolvedValueOnce(
      err({ code: 'DB_ERROR', message: 'connection lost' })
    );
    const { service, storage } = createService(repo);

    const stats = await service.sweep();

    expect(stats).toEqual({ batches: 0, attempted: 0, succeeded: 0, failed: 0 });
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('markDeleted error after S3 success: logs and stops the loop without throwing', async () => {
    const batch = [buildMedia(), buildMedia()];
    const repo = createMockRepo();
    repo.findPendingDeleteBatch.mockResolvedValueOnce(ok(batch));
    repo.markDeleted.mockResolvedValueOnce(
      err({ code: 'DB_ERROR', message: 'mark failed' })
    );
    const { service } = createService(repo);

    const stats = await service.sweep();

    expect(stats.batches).toBe(1);
    expect(stats.succeeded).toBe(2);
    expect(repo.findPendingDeleteBatch).toHaveBeenCalledTimes(1);
  });

  it('drain across batches: processes a full batch then a short batch then stops', async () => {
    const firstBatch = Array.from({ length: BATCH_SIZE }, () => buildMedia());
    const secondBatch = [buildMedia(), buildMedia()];
    const repo = createMockRepo();
    repo.findPendingDeleteBatch
      .mockResolvedValueOnce(ok(firstBatch))
      .mockResolvedValueOnce(ok(secondBatch));
    const { service } = createService(repo);

    const stats = await service.sweep();

    expect(stats.batches).toBe(2);
    expect(stats.attempted).toBe(BATCH_SIZE + 2);
    expect(repo.findPendingDeleteBatch).toHaveBeenCalledTimes(2);
  });

  it('safety cap: stops after MAX_BATCHES_PER_RUN even if more rows exist', async () => {
    const repo = createMockRepo();
    const fullBatch = Array.from({ length: BATCH_SIZE }, () => buildMedia());
    repo.findPendingDeleteBatch.mockResolvedValue(ok(fullBatch));
    const { service } = createService(repo);

    const stats = await service.sweep();

    expect(stats.batches).toBe(MAX_BATCHES_PER_RUN);
    expect(repo.findPendingDeleteBatch).toHaveBeenCalledTimes(MAX_BATCHES_PER_RUN);
  });
});

describe('MediaSweeperService.runSweep', () => {
  beforeEach(() => jest.resetAllMocks());

  it('concurrent invocation: second call returns early without DB calls', async () => {
    const repo = createMockRepo();
    let resolveBatch: (v: any) => void = () => {};
    const slow = new Promise<any>((resolve) => {
      resolveBatch = resolve;
    });
    repo.findPendingDeleteBatch.mockReturnValueOnce(slow as any);
    const { service } = createService(repo);

    const run1 = service.runSweep();
    const run2 = service.runSweep();

    resolveBatch(ok([]));
    await Promise.all([run1, run2]);

    expect(repo.findPendingDeleteBatch).toHaveBeenCalledTimes(1);
  });

  it('logs dead-letter count in the summary', async () => {
    const repo = createMockRepo();
    repo.findPendingDeleteBatch.mockResolvedValue(ok([]));
    repo.countDeadLettered.mockResolvedValue(ok(7));
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service } = createService(repo);

    await service.runSweep();

    expect(repo.countDeadLettered).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('dead-letter count: 7'));
    logSpy.mockRestore();
  });
});

/**
 * Launch condition C-3 — audio deleted within the retention window.
 *
 * The sweeper already owned deletion; what was missing was anything that MARKED
 * audio for deletion because time had passed. These cover that arrow.
 */
describe('MediaSweeperService.expireAudio (C-3)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('asks the repository for media older than one retention window', async () => {
    const repo = createMockRepo();
    repo.expireAudioOlderThan.mockResolvedValue(ok(4));
    const { service } = createService(repo);

    const expired = await service.expireAudio(new Date('2026-08-06T12:00:00.000Z'));

    expect(expired).toBe(4);
    const [cutoff] = repo.expireAudioOlderThan.mock.calls[0];
    expect((cutoff as Date).toISOString()).toBe('2026-08-04T12:00:00.000Z');
  });

  it('returns 0 and does not throw when marking fails', async () => {
    const repo = createMockRepo();
    repo.expireAudioOlderThan.mockResolvedValue(err({ code: 'DB_ERROR', message: 'boom' }));
    const { service } = createService(repo);

    await expect(service.expireAudio()).resolves.toBe(0);
  });
});

describe('MediaSweeperService.runSweep — mark-then-sweep ordering (C-3)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('marks BEFORE sweeping, so an object crossing the window dies in the same tick', async () => {
    // If these ran the other way round, a newly expired object would wait for
    // the NEXT hourly tick to be deleted — doubling the worst-case overshoot.
    const order: string[] = [];
    const repo = createMockRepo();
    repo.expireAudioOlderThan.mockImplementation(async () => {
      order.push('mark');
      return ok(1);
    });
    repo.findPendingDeleteBatch.mockImplementation(async () => {
      order.push('sweep');
      return ok([]);
    });
    repo.countDeadLettered.mockResolvedValue(ok(0));
    const { service } = createService(repo);

    await service.runSweep();

    expect(order).toEqual(['mark', 'sweep']);
  });

  it('still sweeps the existing backlog when marking fails', async () => {
    const repo = createMockRepo();
    repo.expireAudioOlderThan.mockResolvedValue(err({ code: 'DB_ERROR', message: 'boom' }));
    repo.findPendingDeleteBatch.mockResolvedValue(ok([]));
    repo.countDeadLettered.mockResolvedValue(ok(0));
    const { service } = createService(repo);

    await service.runSweep();

    expect(repo.findPendingDeleteBatch).toHaveBeenCalled();
  });

  it('reports the number expired in the summary line', async () => {
    const repo = createMockRepo();
    repo.expireAudioOlderThan.mockResolvedValue(ok(3));
    repo.findPendingDeleteBatch.mockResolvedValue(ok([]));
    repo.countDeadLettered.mockResolvedValue(ok(0));
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { service } = createService(repo);

    await service.runSweep();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('3 expired by retention'));
    logSpy.mockRestore();
  });
});
