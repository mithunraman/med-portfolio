import { Types } from 'mongoose';
import { ok, err } from '../../common/utils/result.util';
import { AccountCleanupService } from '../account-cleanup.service';

// ── Helpers ──

const oid = () => new Types.ObjectId();
const targetUserId = oid();
const otherUserId = oid();
const convId1 = oid();
const convId2 = oid();

// ── Mock factories ──

function createMockRepo() {
  return {
    anonymizeByUser: jest.fn().mockResolvedValue(ok(0)),
    anonymizeByConversationIds: jest.fn().mockResolvedValue(ok(0)),
    findConversationIdsByUser: jest.fn().mockResolvedValue(ok([])),
    findByUser: jest.fn().mockResolvedValue(ok([])),
    deleteByUser: jest.fn().mockResolvedValue(ok(0)),
    cancelByUser: jest.fn().mockResolvedValue(ok(0)),
  };
}

function createMockUserModel() {
  return {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
}

const mockStorageService = {
  deleteObject: jest.fn().mockResolvedValue(undefined),
};

function createService() {
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

  const userModel = createMockUserModel();

  const service = new AccountCleanupService(
    userModel as any,
    repos.artefactsRepo as any,
    repos.conversationsRepo as any,
    repos.mediaRepo as any,
    repos.pdpGoalsRepo as any,
    repos.reviewPeriodsRepo as any,
    repos.analysisRunsRepo as any,
    repos.itemsRepo as any,
    repos.versionHistoryRepo as any,
    repos.outboxRepo as any,
    mockStorageService as any
  );

  return { service, repos, userModel };
}

/** Set up userModel to return one user ready for deletion */
function setupUserForDeletion(
  userModel: ReturnType<typeof createMockUserModel>,
  userId: Types.ObjectId
) {
  userModel.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: userId }]),
    }),
  });
}

// ── Tests ──

describe('AccountCleanupService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockStorageService.deleteObject.mockResolvedValue(undefined);
  });

  // ── processExpiredDeletions ──

  describe('processExpiredDeletions', () => {
    it('should skip when no users are ready for deletion', async () => {
      const { service, repos } = createService();

      await service.processExpiredDeletions();

      expect(repos.artefactsRepo.anonymizeByUser).not.toHaveBeenCalled();
    });

    it('should query for users with expired deletionScheduledFor and no anonymizedAt', async () => {
      const { service, userModel } = createService();

      await service.processExpiredDeletions();

      expect(userModel.find).toHaveBeenCalledWith({
        deletionScheduledFor: { $lte: expect.any(Date) },
        anonymizedAt: null,
      });
    });

    it('should not run concurrently', async () => {
      const { service, userModel } = createService();

      let resolveQuery: (value: any) => void;
      const slowQuery = new Promise((resolve) => {
        resolveQuery = resolve;
      });
      userModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue(slowQuery),
        }),
      });

      const run1 = service.processExpiredDeletions();
      const run2 = service.processExpiredDeletions();

      resolveQuery!([]);
      await run1;
      await run2;

      expect(userModel.find).toHaveBeenCalledTimes(1);
    });
  });

  // ── Data isolation ──

  describe('data isolation — only target user affected', () => {
    it('should call anonymizeByUser with only the target userId on every repository', async () => {
      const { service, repos, userModel } = createService();
      setupUserForDeletion(userModel, targetUserId);

      await service.processExpiredDeletions();

      expect(repos.artefactsRepo.anonymizeByUser).toHaveBeenCalledWith(targetUserId);
      expect(repos.conversationsRepo.anonymizeByUser).toHaveBeenCalledWith(targetUserId);
      expect(repos.mediaRepo.anonymizeByUser).toHaveBeenCalledWith(targetUserId);
      expect(repos.pdpGoalsRepo.anonymizeByUser).toHaveBeenCalledWith(targetUserId);
      expect(repos.reviewPeriodsRepo.anonymizeByUser).toHaveBeenCalledWith(targetUserId);
      expect(repos.itemsRepo.anonymizeByUser).toHaveBeenCalledWith(targetUserId);
      expect(repos.versionHistoryRepo.deleteByUser).toHaveBeenCalledWith(targetUserId);
    });

    it('should never call any repository with a different userId', async () => {
      const { service, repos, userModel } = createService();
      setupUserForDeletion(userModel, targetUserId);

      await service.processExpiredDeletions();

      // Verify no repo was called with otherUserId
      for (const repo of Object.values(repos)) {
        for (const method of Object.values(repo)) {
          if (typeof method === 'function' && (method as jest.Mock).mock) {
            const mock = method as jest.Mock;
            for (const call of mock.mock.calls) {
              for (const arg of call) {
                if (arg instanceof Types.ObjectId) {
                  expect(arg.toString()).not.toBe(otherUserId.toString());
                }
              }
            }
          }
        }
      }
    });
  });

  // ── Analysis runs via conversation IDs ──

  describe('analysis runs — indirect user lookup', () => {
    it('should resolve conversation IDs then anonymize analysis runs by those IDs', async () => {
      const { service, repos, userModel } = createService();
      setupUserForDeletion(userModel, targetUserId);
      repos.conversationsRepo.findConversationIdsByUser.mockResolvedValue(
        ok([convId1, convId2])
      );

      await service.processExpiredDeletions();

      expect(repos.conversationsRepo.findConversationIdsByUser).toHaveBeenCalledWith(targetUserId);
      expect(repos.analysisRunsRepo.anonymizeByConversationIds).toHaveBeenCalledWith([
        convId1,
        convId2,
      ]);
    });

    it('should skip analysis runs if no conversations exist', async () => {
      const { service, repos, userModel } = createService();
      setupUserForDeletion(userModel, targetUserId);
      repos.conversationsRepo.findConversationIdsByUser.mockResolvedValue(ok([]));

      await service.processExpiredDeletions();

      expect(repos.analysisRunsRepo.anonymizeByConversationIds).not.toHaveBeenCalled();
    });
  });

  // ── S3 media deletion ──

  describe('S3 media deletion', () => {
    it('should delete each S3 object then mark media as DELETED via repo', async () => {
      const { service, repos, userModel } = createService();
      setupUserForDeletion(userModel, targetUserId);

      const mediaItems = [
        { bucket: 'media-bucket', key: 'media/file1.m4a' },
        { bucket: 'media-bucket', key: 'media/file2.m4a' },
      ];
      repos.mediaRepo.findByUser.mockResolvedValue(ok(mediaItems));

      await service.processExpiredDeletions();

      expect(mockStorageService.deleteObject).toHaveBeenCalledTimes(2);
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith('media-bucket', 'media/file1.m4a');
      expect(mockStorageService.deleteObject).toHaveBeenCalledWith('media-bucket', 'media/file2.m4a');
      expect(repos.mediaRepo.anonymizeByUser).toHaveBeenCalledWith(targetUserId);
    });

    it('should continue deleting remaining files if one S3 delete fails', async () => {
      const { service, repos, userModel } = createService();
      setupUserForDeletion(userModel, targetUserId);

      repos.mediaRepo.findByUser.mockResolvedValue(
        ok([
          { bucket: 'b', key: 'f1' },
          { bucket: 'b', key: 'f2' },
          { bucket: 'b', key: 'f3' },
        ])
      );

      mockStorageService.deleteObject
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('S3 timeout'))
        .mockResolvedValueOnce(undefined);

      await service.processExpiredDeletions();

      expect(mockStorageService.deleteObject).toHaveBeenCalledTimes(3);
      expect(repos.mediaRepo.anonymizeByUser).toHaveBeenCalledWith(targetUserId);
    });
  });

  // ── Outbox cancellation ──

  describe('outbox cancellation', () => {
    it('should cancel outbox entries using userId and conversation ID strings', async () => {
      const { service, repos, userModel } = createService();
      setupUserForDeletion(userModel, targetUserId);
      repos.conversationsRepo.findConversationIdsByUser.mockResolvedValue(
        ok([convId1])
      );

      await service.processExpiredDeletions();

      expect(repos.outboxRepo.cancelByUser).toHaveBeenCalledWith(targetUserId, [
        convId1.toString(),
      ]);
    });
  });

  // ── Error resilience ──

  describe('error resilience', () => {
    it('should continue remaining steps if one repository returns an error', async () => {
      const { service, repos, userModel } = createService();
      setupUserForDeletion(userModel, targetUserId);

      // Make artefacts fail
      repos.artefactsRepo.anonymizeByUser.mockResolvedValue(
        err({ code: 'DB_ERROR', message: 'connection lost' })
      );

      await service.processExpiredDeletions();

      // Steps after artefacts should still execute
      expect(repos.pdpGoalsRepo.anonymizeByUser).toHaveBeenCalled();
      expect(repos.reviewPeriodsRepo.anonymizeByUser).toHaveBeenCalled();
      expect(repos.itemsRepo.anonymizeByUser).toHaveBeenCalled();
      expect(repos.versionHistoryRepo.deleteByUser).toHaveBeenCalled();
    });
  });

  // ── User record anonymization ──

  describe('user record anonymization', () => {
    it('should anonymize user with correct fields and increment tokenVersion', async () => {
      const { service, userModel } = createService();
      setupUserForDeletion(userModel, targetUserId);

      await service.processExpiredDeletions();

      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: targetUserId },
        {
          $set: {
            name: 'Deleted User',
            email: `deleted-${targetUserId.toString()}@removed.local`,
            specialty: null,
            trainingStage: null,
            deletionRequestedAt: null,
            deletionScheduledFor: null,
            anonymizedAt: expect.any(Date),
          },
          $inc: { tokenVersion: 1 },
        }
      );
    });
  });
});
