import { AnalysisRunStatus, TERMINAL_RUN_STATUSES } from '@acme/shared';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  CHECKPOINT_PURGE_GRACE_MS,
  STALE_AWAITING_INPUT_RUN_MS,
  STALE_EXECUTING_RUN_MS,
} from '../../common/checkpoint-retention.constants';
import { err, ok } from '../../common/utils/result.util';
import { CheckpointSweeperService } from '../checkpoint-sweeper.service';

const NOW = new Date('2026-08-14T12:00:00.000Z');
const oid = () => new Types.ObjectId();

/**
 * `findRunsForSweepBatch` is polled in a loop, so a mock returning the same rows
 * forever would spin. This hands out each batch once and then goes empty,
 * mirroring the real "rows leave the result set once they're processed"
 * behaviour.
 */
function drainingMock<T>(batches: T[][]) {
  const queue = [...batches];
  return jest.fn().mockImplementation(async () => ok(queue.shift() ?? []));
}

function createSweeper(
  overrides: {
    expireStale?: jest.Mock;
    sweepBatch?: jest.Mock;
    purgeThreads?: jest.Mock;
    markPurged?: jest.Mock;
  } = {}
) {
  const analysisRunsRepository = {
    expireStaleRuns: overrides.expireStale ?? jest.fn().mockResolvedValue(ok(0)),
    findRunsForSweepBatch: overrides.sweepBatch ?? drainingMock([]),
    markCheckpointsPurged: overrides.markPurged ?? jest.fn().mockResolvedValue(ok(0)),
  };
  const checkpointRepository = {
    purgeThreads:
      overrides.purgeThreads ?? jest.fn().mockResolvedValue(ok({ checkpoints: 0, writes: 0 })),
  };

  const service = new CheckpointSweeperService(
    analysisRunsRepository as never,
    checkpointRepository as never
  );

  return { service, analysisRunsRepository, checkpointRepository };
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
});

afterAll(() => jest.restoreAllMocks());

describe('CheckpointSweeperService', () => {
  describe('expireStaleRuns', () => {
    it('applies a short window to PENDING/RUNNING and a long one to AWAITING_INPUT', async () => {
      // The two clocks are different phenomena: a crashed pipeline (which also
      // wedges the conversation's one active-run slot) versus a trainee who
      // walked away. Collapsing them either strands conversations for months or
      // kills journeys someone still intended to finish.
      const { service, analysisRunsRepository } = createSweeper();

      await service.expireStaleRuns(NOW);

      const calls = analysisRunsRepository.expireStaleRuns.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toEqual([AnalysisRunStatus.PENDING, AnalysisRunStatus.RUNNING]);
      expect(calls[0][1]).toEqual(new Date(NOW.getTime() - STALE_EXECUTING_RUN_MS));
      expect(calls[1][0]).toEqual([AnalysisRunStatus.AWAITING_INPUT]);
      expect(calls[1][1]).toEqual(new Date(NOW.getTime() - STALE_AWAITING_INPUT_RUN_MS));
    });

    it('sums the runs transitioned across both clocks', async () => {
      const expireStale = jest
        .fn()
        .mockResolvedValueOnce(ok(3))
        .mockResolvedValueOnce(ok(4));
      const { service } = createSweeper({ expireStale });

      await expect(service.expireStaleRuns(NOW)).resolves.toBe(7);
    });

    it('still applies the second clock when the first fails', async () => {
      // The rules are independent — a transient failure expiring crashed
      // pipelines must not also strand every abandoned journey for an hour.
      const expireStale = jest
        .fn()
        .mockResolvedValueOnce(err({ code: 'DB_ERROR', message: 'boom' }))
        .mockResolvedValueOnce(ok(5));
      const { service } = createSweeper({ expireStale });

      await expect(service.expireStaleRuns(NOW)).resolves.toBe(5);
      expect(expireStale).toHaveBeenCalledTimes(2);
    });
  });

  describe('purgeTerminalRuns', () => {
    it('asks for every terminal status in one query, past the grace period', async () => {
      // `$in` on the leading index key stays tightly bounded, so there is no
      // reason to issue one query per status.
      const { service, analysisRunsRepository } = createSweeper();

      await service.purgeTerminalRuns(NOW);

      expect(analysisRunsRepository.findRunsForSweepBatch).toHaveBeenCalledTimes(1);
      const [statuses, cutoff] = analysisRunsRepository.findRunsForSweepBatch.mock.calls[0];
      expect(statuses).toEqual([...TERMINAL_RUN_STATUSES]);
      expect(cutoff).toEqual(new Date(NOW.getTime() - CHECKPOINT_PURGE_GRACE_MS));
    });

    it('deletes checkpoint data, then marks the run purged', async () => {
      const runId = oid();
      const purgeThreads = jest.fn().mockResolvedValue(ok({ checkpoints: 30, writes: 42 }));
      const markPurged = jest.fn().mockResolvedValue(ok(1));
      const { service } = createSweeper({
        sweepBatch: drainingMock([
          [{ _id: runId, status: AnalysisRunStatus.COMPLETED, langGraphThreadId: 'conv:1' }],
        ]),
        purgeThreads,
        markPurged,
      });

      const stats = await service.purgeTerminalRuns(NOW);

      expect(purgeThreads).toHaveBeenCalledWith(['conv:1']);
      expect(markPurged).toHaveBeenCalledWith([runId], NOW);
      expect(purgeThreads.mock.invocationCallOrder[0]).toBeLessThan(
        markPurged.mock.invocationCallOrder[0]
      );
      expect(stats).toEqual({ threads: 1, checkpoints: 30, writes: 42 });
    });

    it('purges a batch that mixes terminal statuses', async () => {
      // A single `$in` query returns whatever matches, so batches are no longer
      // status-homogeneous. Nothing downstream branches on status — the purge is
      // keyed by thread id and the marker by _id.
      const runA = oid();
      const runB = oid();
      const purgeThreads = jest.fn().mockResolvedValue(ok({ checkpoints: 4, writes: 2 }));
      const markPurged = jest.fn().mockResolvedValue(ok(2));
      const { service } = createSweeper({
        sweepBatch: drainingMock([
          [
            { _id: runA, status: AnalysisRunStatus.COMPLETED, langGraphThreadId: 'conv:1' },
            { _id: runB, status: AnalysisRunStatus.EXPIRED, langGraphThreadId: 'conv:2' },
          ],
        ]),
        purgeThreads,
        markPurged,
      });

      const stats = await service.purgeTerminalRuns(NOW);

      expect(purgeThreads).toHaveBeenCalledWith(['conv:1', 'conv:2']);
      expect(markPurged).toHaveBeenCalledWith([runA, runB], NOW);
      expect(stats.threads).toBe(2);
    });

    it('does not mark the run purged when the delete fails', async () => {
      // Marking before (or despite) a failed delete strands the data with its
      // only handle recorded as clean — the one state the sweep cannot recover
      // from. The rows stay unmarked and are retried next tick.
      const markPurged = jest.fn().mockResolvedValue(ok(0));
      const { service } = createSweeper({
        sweepBatch: drainingMock([
          [{ _id: oid(), status: AnalysisRunStatus.FAILED, langGraphThreadId: 'conv:1' }],
        ]),
        purgeThreads: jest.fn().mockResolvedValue(err({ code: 'DB_ERROR', message: 'boom' })),
        markPurged,
      });

      const stats = await service.purgeTerminalRuns(NOW);

      expect(markPurged).not.toHaveBeenCalled();
      expect(stats.threads).toBe(0);
    });
  });

  describe('runSweep', () => {
    // Asserts call order only. It cannot say anything about what the purge
    // collects: the repository is mocked, so expiry's `updatedAt` bump never
    // happens here.
    it('runs both expiry clocks before the purge', async () => {
      const order: string[] = [];
      const expireStale = jest.fn().mockImplementation(async () => {
        order.push('expire');
        return ok(0);
      });
      const sweepBatch = jest.fn().mockImplementation(async () => {
        order.push('purge');
        return ok([]);
      });
      const { service } = createSweeper({ expireStale, sweepBatch });

      await service.sweep(NOW);

      expect(order).toEqual(['expire', 'expire', 'purge']);
    });

    it('does not run concurrently', async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const expireStale = jest.fn().mockImplementation(async () => {
        await gate;
        return ok(0);
      });
      const { service } = createSweeper({ expireStale });

      const first = service.runSweep();
      const second = service.runSweep();
      release();
      await Promise.all([first, second]);

      // One call per staleness rule. A second concurrent sweep would double it.
      expect(expireStale).toHaveBeenCalledTimes(2);
    });
  });
});
