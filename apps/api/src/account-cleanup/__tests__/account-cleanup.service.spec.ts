import { ForbiddenException, Logger } from '@nestjs/common';
import { SessionRevokedReason } from '@acme/shared';
import { Types } from 'mongoose';
import { err, ok } from '../../common/utils/result.util';
import { AccountCleanupService } from '../account-cleanup.service';

// ── Helpers ──

const oid = () => new Types.ObjectId();

function flaggedUser(userId: Types.ObjectId) {
  return { _id: userId, deletionRequestedAt: new Date(), anonymizedAt: null };
}

function unflaggedUser(userId: Types.ObjectId) {
  return { _id: userId, deletionRequestedAt: null, anonymizedAt: null };
}

function alreadyAnonymizedUser(userId: Types.ObjectId) {
  return { _id: userId, deletionRequestedAt: new Date(), anonymizedAt: new Date() };
}

function createMockRepo() {
  return {
    markDeletedByUserId: jest.fn().mockResolvedValue(ok(0)),
    markDeletedByConversationIds: jest.fn().mockResolvedValue(ok(0)),
    findConversationIdsByUser: jest.fn().mockResolvedValue(ok([])),
    findByUser: jest.fn().mockResolvedValue(ok([])),
    deleteByUserId: jest.fn().mockResolvedValue(ok(0)),
    cancelByUser: jest.fn().mockResolvedValue(ok(0)),
    markPendingDeleteByUser: jest.fn().mockResolvedValue(ok(0)),
  };
}

/** Mock the userModel with two lookup shapes: `find().select().lean()` (cron query) and `findById().select().lean()` (gate). */
function createMockUserModel(opts: {
  cronUsers?: Array<{ _id: Types.ObjectId }>;
  /** Maps userId string → the document the gate finds. */
  byId?: Record<string, { deletionRequestedAt: Date | null; anonymizedAt: Date | null } | null>;
} = {}) {
  const cronUsers = opts.cronUsers ?? [];
  const byId = opts.byId ?? {};

  return {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(cronUsers),
      }),
    }),
    findById: jest.fn((id: Types.ObjectId) => ({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue(byId[id.toString()] ?? null),
      }),
    })),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
}

function createService(
  userModelOpts: Parameters<typeof createMockUserModel>[0] = {}
) {
  const repos = {
    artefactsRepo: createMockRepo(),
    conversationsRepo: createMockRepo(),
    mediaRepo: createMockRepo(),
    pdpGoalsRepo: createMockRepo(),
    reviewPeriodsRepo: createMockRepo(),
    analysisRunsRepo: createMockRepo(),
    itemsRepo: createMockRepo(),
    versionHistoryRepo: createMockRepo(),
    outboxRepo: createMockRepo(),
  };

  const sessionRepo = {
    revokeAllByUser: jest.fn().mockResolvedValue(ok(0)),
  };

  const userModel = createMockUserModel(userModelOpts);

  const service = new AccountCleanupService(
    userModel as never,
    repos.artefactsRepo as never,
    repos.conversationsRepo as never,
    repos.mediaRepo as never,
    repos.pdpGoalsRepo as never,
    repos.reviewPeriodsRepo as never,
    repos.analysisRunsRepo as never,
    repos.itemsRepo as never,
    repos.versionHistoryRepo as never,
    repos.outboxRepo as never,
    sessionRepo as never
  );

  return { service, repos, userModel, sessionRepo };
}

// ── Tests ──

describe('AccountCleanupService', () => {
  describe('processExpiredDeletions', () => {
    it('skips when no users are ready for deletion', async () => {
      const { service, repos } = createService();

      await service.processExpiredDeletions();

      expect(repos.artefactsRepo.markDeletedByUserId).not.toHaveBeenCalled();
    });

    it('queries for users with expired deletionScheduledFor and no anonymizedAt', async () => {
      const { service, userModel } = createService();

      await service.processExpiredDeletions();

      expect(userModel.find).toHaveBeenCalledWith({
        deletionScheduledFor: { $lte: expect.any(Date) },
        anonymizedAt: null,
      });
    });

    it('does not run concurrently', async () => {
      let resolveQuery: (value: unknown) => void = () => {};
      const slowQuery = new Promise((resolve) => {
        resolveQuery = resolve;
      });
      const { service, userModel } = createService();
      userModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue(slowQuery),
        }),
      });

      const run1 = service.processExpiredDeletions();
      const run2 = service.processExpiredDeletions();

      resolveQuery([]);
      await run1;
      await run2;

      expect(userModel.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('safety gate (assertUserMarkedForDeletion)', () => {
    it('refuses when the user record is not found', async () => {
      const targetUserId = oid();
      const { service, repos } = createService({
        byId: { [targetUserId.toString()]: null },
      });

      await expect(service.triggerDeletion(targetUserId.toString())).rejects.toThrow(
        ForbiddenException
      );
      expect(repos.artefactsRepo.markDeletedByUserId).not.toHaveBeenCalled();
    });

    it('refuses when the user has not requested deletion', async () => {
      const targetUserId = oid();
      const { service, repos, userModel } = createService({
        byId: { [targetUserId.toString()]: unflaggedUser(targetUserId) },
      });

      await expect(service.triggerDeletion(targetUserId.toString())).rejects.toThrow(
        /has not requested deletion/
      );
      expect(repos.artefactsRepo.markDeletedByUserId).not.toHaveBeenCalled();
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('refuses replay against a user already anonymized', async () => {
      const targetUserId = oid();
      const { service, repos } = createService({
        byId: { [targetUserId.toString()]: alreadyAnonymizedUser(targetUserId) },
      });

      await expect(service.triggerDeletion(targetUserId.toString())).rejects.toThrow(
        /already anonymized/
      );
      expect(repos.artefactsRepo.markDeletedByUserId).not.toHaveBeenCalled();
    });
  });

  describe('three-step flow (lock → purge → mark)', () => {
    it('step 1 locks the account: revokes sessions and wipes PII without setting anonymizedAt', async () => {
      const targetUserId = oid();
      const { service, userModel, sessionRepo } = createService({
        byId: { [targetUserId.toString()]: flaggedUser(targetUserId) },
      });

      await service.triggerDeletion(targetUserId.toString());

      expect(sessionRepo.revokeAllByUser).toHaveBeenCalledWith(
        targetUserId.toString(),
        SessionRevokedReason.LOGOUT_ALL
      );

      // First updateOne is the lock — PII wipe only, no anonymizedAt.
      expect(userModel.updateOne).toHaveBeenNthCalledWith(
        1,
        { _id: targetUserId },
        {
          $set: {
            name: 'Deleted User',
            email: `deleted-${targetUserId.toString()}@removed.local`,
            specialty: null,
            trainingStage: null,
          },
        }
      );
    });

    it('step 2 calls every purge primitive with only the target userId', async () => {
      const targetUserId = oid();
      const convId1 = oid();
      const { service, repos } = createService({
        byId: { [targetUserId.toString()]: flaggedUser(targetUserId) },
      });
      repos.conversationsRepo.findConversationIdsByUser.mockResolvedValue(ok([convId1]));

      await service.triggerDeletion(targetUserId.toString());

      expect(repos.artefactsRepo.markDeletedByUserId).toHaveBeenCalledWith(targetUserId);
      expect(repos.conversationsRepo.markDeletedByUserId).toHaveBeenCalledWith(targetUserId);
      expect(repos.pdpGoalsRepo.markDeletedByUserId).toHaveBeenCalledWith(targetUserId);
      expect(repos.reviewPeriodsRepo.markDeletedByUserId).toHaveBeenCalledWith(targetUserId);
      expect(repos.itemsRepo.markDeletedByUserId).toHaveBeenCalledWith(targetUserId);
      expect(repos.versionHistoryRepo.deleteByUserId).toHaveBeenCalledWith(targetUserId);
      expect(repos.mediaRepo.markPendingDeleteByUser).toHaveBeenCalledWith(
        targetUserId.toString()
      );
      expect(repos.outboxRepo.cancelByUser).toHaveBeenCalledWith(targetUserId, [
        convId1.toString(),
      ]);
      expect(repos.analysisRunsRepo.markDeletedByConversationIds).toHaveBeenCalledWith([
        convId1,
      ]);
    });

    it('step 2 runs steps concurrently (Promise.allSettled, not serial await)', async () => {
      const targetUserId = oid();
      const { service, repos } = createService({
        byId: { [targetUserId.toString()]: flaggedUser(targetUserId) },
      });

      // Make artefacts the slowest step — if execution were serial, every
      // step before it would settle first. With Promise.allSettled the order
      // doesn't matter; what we check is that the slow step doesn't block
      // others from being *invoked*.
      const order: string[] = [];
      const slow = new Promise<ReturnType<typeof ok>>((resolve) => {
        setTimeout(() => {
          order.push('artefacts');
          resolve(ok(0));
        }, 20);
      });
      repos.artefactsRepo.markDeletedByUserId.mockReturnValueOnce(slow);
      repos.pdpGoalsRepo.markDeletedByUserId.mockImplementationOnce(async () => {
        order.push('pdpGoals');
        return ok(0);
      });

      await service.triggerDeletion(targetUserId.toString());

      // pdpGoals must finish before the slow artefacts step — proves concurrency.
      expect(order).toEqual(['pdpGoals', 'artefacts']);
    });

    it('step 3 sets anonymizedAt only when every step 2 purge succeeds', async () => {
      const targetUserId = oid();
      const { service, userModel } = createService({
        byId: { [targetUserId.toString()]: flaggedUser(targetUserId) },
      });

      await service.triggerDeletion(targetUserId.toString());

      // Two writes: step 1 (lock) and step 3 (mark anonymized).
      expect(userModel.updateOne).toHaveBeenCalledTimes(2);
      expect(userModel.updateOne).toHaveBeenLastCalledWith(
        { _id: targetUserId },
        {
          $set: {
            deletionRequestedAt: null,
            deletionScheduledFor: null,
            anonymizedAt: expect.any(Date),
          },
        }
      );
    });
  });

  describe('partial-failure retry semantics', () => {
    it('does not mark anonymized when any step 2 purge fails', async () => {
      const targetUserId = oid();
      const { service, repos, userModel } = createService({
        byId: { [targetUserId.toString()]: flaggedUser(targetUserId) },
      });
      repos.artefactsRepo.markDeletedByUserId.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'connection lost' })
      );

      await service.triggerDeletion(targetUserId.toString());

      // Step 1 lock happened (write #1). Step 3 mark did NOT.
      expect(userModel.updateOne).toHaveBeenCalledTimes(1);
      const lastCall = userModel.updateOne.mock.calls[0]![1] as { $set: Record<string, unknown> };
      expect(lastCall.$set).not.toHaveProperty('anonymizedAt');
    });

    it('runs every step 2 primitive even if one fails (parallel fan-out, fail-soft)', async () => {
      const targetUserId = oid();
      const { service, repos } = createService({
        byId: { [targetUserId.toString()]: flaggedUser(targetUserId) },
      });
      repos.artefactsRepo.markDeletedByUserId.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'boom' })
      );

      await service.triggerDeletion(targetUserId.toString());

      expect(repos.pdpGoalsRepo.markDeletedByUserId).toHaveBeenCalled();
      expect(repos.reviewPeriodsRepo.markDeletedByUserId).toHaveBeenCalled();
      expect(repos.itemsRepo.markDeletedByUserId).toHaveBeenCalled();
      expect(repos.versionHistoryRepo.deleteByUserId).toHaveBeenCalled();
      expect(repos.conversationsRepo.markDeletedByUserId).toHaveBeenCalled();
      expect(repos.mediaRepo.markPendingDeleteByUser).toHaveBeenCalled();
    });

    it('analysis runs and outbox skip their conversation-id dependent paths when no conversations exist', async () => {
      const targetUserId = oid();
      const { service, repos } = createService({
        byId: { [targetUserId.toString()]: flaggedUser(targetUserId) },
      });
      repos.conversationsRepo.findConversationIdsByUser.mockResolvedValue(ok([]));

      await service.triggerDeletion(targetUserId.toString());

      expect(repos.analysisRunsRepo.markDeletedByConversationIds).not.toHaveBeenCalled();
      // outbox still runs — userId-only cancellation covers the empty-conv case
      expect(repos.outboxRepo.cancelByUser).toHaveBeenCalledWith(targetUserId, []);
    });

    it('a conversation-id resolution failure leaves the run un-completed (no anonymizedAt write)', async () => {
      // Regression guard: analysis_runs has no userId field, so conv-id
      // resolution is the only handle. If the resolver silently returned []
      // on error, the analysis-runs step would no-op, no failure would be
      // recorded, markAccountAnonymized would run, and the user would never
      // be revisited — orphaning analysis-run docs forever.
      const targetUserId = oid();
      const { service, repos, userModel } = createService({
        byId: { [targetUserId.toString()]: flaggedUser(targetUserId) },
      });
      repos.conversationsRepo.findConversationIdsByUser.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'conn lost' })
      );

      await expect(service.triggerDeletion(targetUserId.toString())).rejects.toThrow(
        /failed to resolve conversation ids/
      );

      // Lock ran (Step 1 runs before the resolver).
      expect(userModel.updateOne).toHaveBeenCalledTimes(1);
      const lockWrite = userModel.updateOne.mock.calls[0]![1] as {
        $set: Record<string, unknown>;
      };
      expect(lockWrite.$set).not.toHaveProperty('anonymizedAt');

      // No purge primitives reached — resolver threw before the steps array fired.
      expect(repos.analysisRunsRepo.markDeletedByConversationIds).not.toHaveBeenCalled();
      expect(repos.outboxRepo.cancelByUser).not.toHaveBeenCalled();
      expect(repos.artefactsRepo.markDeletedByUserId).not.toHaveBeenCalled();
    });
  });

  describe('cron path uses the same gate + flow', () => {
    it('iterates flagged users and runs the gate per user', async () => {
      const userA = oid();
      const userB = oid();
      const { service, repos } = createService({
        cronUsers: [{ _id: userA }, { _id: userB }],
        byId: {
          [userA.toString()]: flaggedUser(userA),
          [userB.toString()]: flaggedUser(userB),
        },
      });

      await service.processExpiredDeletions();

      expect(repos.artefactsRepo.markDeletedByUserId).toHaveBeenCalledWith(userA);
      expect(repos.artefactsRepo.markDeletedByUserId).toHaveBeenCalledWith(userB);
    });

    it('a failed gate halts the daily batch (userB not reached)', async () => {
      const userA = oid();
      const userB = oid();
      const { service, repos } = createService({
        cronUsers: [{ _id: userA }, { _id: userB }],
        byId: {
          [userA.toString()]: unflaggedUser(userA), // gate refuses
          [userB.toString()]: flaggedUser(userB),
        },
      });

      await expect(service.processExpiredDeletions()).rejects.toThrow(ForbiddenException);

      expect(repos.artefactsRepo.markDeletedByUserId).not.toHaveBeenCalledWith(userA);
      expect(repos.artefactsRepo.markDeletedByUserId).not.toHaveBeenCalledWith(userB);
    });

    it('a non-gate throw on userA is logged and userB still completes', async () => {
      // Per-user isolation regression guard: a transient Mongo error during
      // userA's deletion (here: the resolver rejecting) must NOT halt the
      // batch. userB should be processed normally; userA stays in the cron
      // query for retry on the next tick.
      const userA = oid();
      const userB = oid();
      const { service, repos } = createService({
        cronUsers: [{ _id: userA }, { _id: userB }],
        byId: {
          [userA.toString()]: flaggedUser(userA),
          [userB.toString()]: flaggedUser(userB),
        },
      });

      // Resolver rejects for userA only — userB resolves normally.
      repos.conversationsRepo.findConversationIdsByUser.mockImplementation(
        async (id: Types.ObjectId) =>
          id.equals(userA)
            ? err({ code: 'DB_ERROR', message: 'transient blip' })
            : ok([])
      );

      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      try {
        await service.processExpiredDeletions();
      } finally {
        errorSpy.mockRestore();
      }

      // userA's purges never reached (resolver threw before steps array).
      expect(repos.artefactsRepo.markDeletedByUserId).not.toHaveBeenCalledWith(userA);
      // userB's purges did run — batch continued after userA's throw.
      expect(repos.artefactsRepo.markDeletedByUserId).toHaveBeenCalledWith(userB);
      expect(repos.conversationsRepo.markDeletedByUserId).toHaveBeenCalledWith(userB);
    });
  });
});
