import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
import { UNREDACTED_RETENTION_MS } from '../../common/retention.constants';
import { IConversationsRepository } from '../conversations.repository.interface';
import { MessageRetentionService } from '../message-retention.service';

const BATCH_SIZE = 100;

function ids(n: number): Types.ObjectId[] {
  return Array.from({ length: n }, () => new Types.ObjectId());
}

function createMockRepo(): jest.Mocked<IConversationsRepository> {
  return {
    findExpiredRawContentBatchAcrossAllUsers: jest.fn().mockResolvedValue(ok([])),
    scrubRawContentAcrossAllUsers: jest.fn().mockResolvedValue(ok(0)),
  } as unknown as jest.Mocked<IConversationsRepository>;
}

function build(): { service: MessageRetentionService; repo: jest.Mocked<IConversationsRepository> } {
  const repo = createMockRepo();
  return { service: new MessageRetentionService(repo), repo };
}

describe('MessageRetentionService', () => {
  beforeEach(() => jest.restoreAllMocks());

  describe('cutoff', () => {
    it('asks for messages written more than one retention window ago', async () => {
      const { service, repo } = build();
      const now = new Date('2026-08-06T12:00:00.000Z');

      await service.sweep(now);

      const [cutoff, limit] = repo.findExpiredRawContentBatchAcrossAllUsers.mock.calls[0];
      expect((cutoff as Date).toISOString()).toBe('2026-08-04T12:00:00.000Z');
      expect(now.getTime() - (cutoff as Date).getTime()).toBe(UNREDACTED_RETENTION_MS);
      expect(limit).toBe(BATCH_SIZE);
    });
  });

  describe('batching', () => {
    it('stops on an empty batch without scrubbing', async () => {
      const { service, repo } = build();

      expect(await service.sweep()).toBe(0);
      expect(repo.findExpiredRawContentBatchAcrossAllUsers).toHaveBeenCalledTimes(1);
      expect(repo.scrubRawContentAcrossAllUsers).not.toHaveBeenCalled();
    });

    it('stops after a short batch — a partial page means the backlog is drained', async () => {
      const { service, repo } = build();
      repo.findExpiredRawContentBatchAcrossAllUsers.mockResolvedValueOnce(ok(ids(3)));
      repo.scrubRawContentAcrossAllUsers.mockResolvedValueOnce(ok(3));

      expect(await service.sweep()).toBe(3);
      expect(repo.findExpiredRawContentBatchAcrossAllUsers).toHaveBeenCalledTimes(1);
    });

    it('continues while batches come back full, accumulating the count', async () => {
      const { service, repo } = build();
      repo.findExpiredRawContentBatchAcrossAllUsers
        .mockResolvedValueOnce(ok(ids(BATCH_SIZE)))
        .mockResolvedValueOnce(ok(ids(BATCH_SIZE)))
        .mockResolvedValueOnce(ok(ids(7)));
      repo.scrubRawContentAcrossAllUsers
        .mockResolvedValueOnce(ok(BATCH_SIZE))
        .mockResolvedValueOnce(ok(BATCH_SIZE))
        .mockResolvedValueOnce(ok(7));

      expect(await service.sweep()).toBe(BATCH_SIZE * 2 + 7);
      expect(repo.findExpiredRawContentBatchAcrossAllUsers).toHaveBeenCalledTimes(3);
    });

    it('is bounded — a never-draining backlog cannot spin forever', async () => {
      const { service, repo } = build();
      repo.findExpiredRawContentBatchAcrossAllUsers.mockResolvedValue(ok(ids(BATCH_SIZE)));
      repo.scrubRawContentAcrossAllUsers.mockResolvedValue(ok(BATCH_SIZE));

      await service.sweep();

      expect(repo.findExpiredRawContentBatchAcrossAllUsers).toHaveBeenCalledTimes(100);
    });
  });

  describe('error handling', () => {
    it('stops on a find error rather than retrying the same page', async () => {
      const { service, repo } = build();
      repo.findExpiredRawContentBatchAcrossAllUsers.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'boom' })
      );

      expect(await service.sweep()).toBe(0);
      expect(repo.findExpiredRawContentBatchAcrossAllUsers).toHaveBeenCalledTimes(1);
      expect(repo.scrubRawContentAcrossAllUsers).not.toHaveBeenCalled();
    });

    it('stops on a scrub error — the same batch would otherwise be re-fetched forever', async () => {
      const { service, repo } = build();
      repo.findExpiredRawContentBatchAcrossAllUsers.mockResolvedValue(ok(ids(BATCH_SIZE)));
      repo.scrubRawContentAcrossAllUsers.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'boom' })
      );

      expect(await service.sweep()).toBe(0);
      expect(repo.findExpiredRawContentBatchAcrossAllUsers).toHaveBeenCalledTimes(1);
    });
  });

  describe('runSweep', () => {
    it('skips while a previous sweep is still running', async () => {
      const { service, repo } = build();
      let release!: () => void;
      repo.findExpiredRawContentBatchAcrossAllUsers.mockReturnValue(
        new Promise((resolve) => {
          release = () => resolve(ok([]));
        })
      );

      const first = service.runSweep();
      await service.runSweep(); // must be a no-op while `first` is in flight
      release();
      await first;

      expect(repo.findExpiredRawContentBatchAcrossAllUsers).toHaveBeenCalledTimes(1);
    });

    it('releases the guard even when the sweep throws', async () => {
      const { service, repo } = build();
      repo.findExpiredRawContentBatchAcrossAllUsers.mockRejectedValueOnce(new Error('boom'));

      await expect(service.runSweep()).rejects.toThrow('boom');

      repo.findExpiredRawContentBatchAcrossAllUsers.mockResolvedValue(ok([]));
      await service.runSweep();
      expect(repo.findExpiredRawContentBatchAcrossAllUsers).toHaveBeenCalledTimes(2);
    });
  });

  describe('logging', () => {
    it('never logs message content — only counts', async () => {
      // Every line here reaches Grafana, whose retention is the only erasure
      // mechanism for anything landing there. The sweep must not be the thing
      // that exports what it is deleting.
      const { service, repo } = build();
      repo.findExpiredRawContentBatchAcrossAllUsers.mockResolvedValueOnce(ok(ids(2)));
      repo.scrubRawContentAcrossAllUsers.mockResolvedValueOnce(ok(2));
      const logged: string[] = [];
      jest
        .spyOn(service['logger'], 'log')
        .mockImplementation((message: unknown) => void logged.push(String(message)));

      await service.runSweep();

      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain('2 message(s) scrubbed');
    });
  });
});
